import TalkMachine from '../talk-to-me-core/js/TalkMachine.js';

export default class DialogMachine extends TalkMachine {
  constructor() {
    super();
    this.initDialogMachine();
  }

  initDialogMachine() {
    this.dialogStarted = false;
    this.lastState = '';
    this.nextState = '';
    this.waitingForUserInput = true;
    this.stateDisplay = document.querySelector('#state-display');
    this.shouldContinue = false;

    // initialiser les éléments de la machine de dialogue
    this.maxLeds = 10;
    this.ui.initLEDUI();

    // Registre des états des boutons - simple array: 0 = released, 1 = pressed
    this.buttonStates = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    //Mes imputs 
    this.isOn = false;
    this.powerButton = 0;   // ON/OFF
    this.controlButton = 1; // next/repeat
    this.yesButton = 2;
    this.noButton = 3;
    this.preset_voice_normal = [0, 1, 0.8];
    this.answerSound = new Audio('./sounds/answer.mp3');
    this.lastPowerToggleMs = 0;

    this.questionPolls = {
      A: [
        "Quand tu n’as pas préparé une réunion, est-ce que tu fais comme si tu étais au courant ?",
        "Quand une tâche pénible doit être faite, est-ce que tu attends que quelqu’un d’autre la prenne ?",
        "Si on te félicite pour un travail que tu n’as pas beaucoup fait, est-ce que tu laisses faire sans corriger ?",
        "Si un problème arrive et que la cause n’est pas claire, est-ce que tu évites de dire que ta partie a peut-être contribué ?",
        "Si on t’offre une opportunité ou une promotion parce qu’on pense que tu es le principal responsable d’un succès d’équipe, est-ce que tu acceptes sans préciser le rôle des autres ?",
      ],
      B: [
        "Quand un ami va mal et te demande d’être disponible ce soir, est-ce que tu annules une soirée importante pour lui ?",
        "Quand tu n’es pas d’accord avec une décision que tu trouves injuste, est-ce que tu fais semblant d’être d’accord pour éviter un conflit ?",
        "Quand un ami te demande ton avis sur un choix important, est-ce que tu dis ce que tu penses vraiment, même si ça peut le vexer ?",
        "Un ami s’est senti humilié par une remarque peut-être sans intention. Il te demande de ne plus inviter cette personne aux moments de groupe. Tu acceptes ?",
        "Si un ami te confie quelque chose de très grave et tu penses que quelqu’un peut être en danger, est-ce que tu en parles à une personne de confiance ou à un professionnel, même s’il te demande de garder le secret ?",
      ],
      C: [
        "Au restaurant, ton plat a un vrai problème. Est-ce que tu le dis clairement au serveur ?",
        "Quelqu’un a une mauvaise haleine ou une odeur forte qui gêne. Est-ce que tu lui dis directement, en privé ?",
        "Un proche te propose un plan qui ne te plaît pas. Est-ce que tu dis non tout de suite, sans inventer d’excuse ?",
        "Quelqu’un te coupe la file ou te passe devant “sans faire exprès”. Est-ce que tu le lui fais remarquer sur le moment ?",
        "Quelqu’un te demande ton avis sur un changement visible chez lui, et tu trouves ça raté. Est-ce que tu dis clairement que tu n’aimes pas ?",
      ],
    };
    this.activePool = 'A';
    this.poolClickCount = 0;
    this.poolSelectionTimeout = null;
  }
initQuestions() {
  this.questions = this.questionPolls[this.activePool] || this.questionPolls.A;
  this.currentQuestionIndex = 0;
  //initialisation des stats du groupe
  this.groupStats = this.questions.map(() => ({
    yes:0,
    no:0,
  }));
  this.fancyLogger.logMessage(`Questions chargees: ${this.questions.length}`);
}

togglePower() {
  this.isOn = !this.isOn;

  if (this.isOn) {
    this.fancyLogger.logMessage('ON -> start welcome');
    this.dialogStarted = true;
    this.poolClickCount = 0;
    if (this.poolSelectionTimeout) {
      clearTimeout(this.poolSelectionTimeout);
      this.poolSelectionTimeout = null;
    }
    this.nextState = 'welcome';
    this.goToNextState();
  } else {
    this.fancyLogger.logMessage('OFF -> stop flow');
    this.ledsAllOff();
    this.speechCancel();
    if (this.poolSelectionTimeout) {
      clearTimeout(this.poolSelectionTimeout);
      this.poolSelectionTimeout = null;
    }
    this.poolClickCount = 0;
    this.shouldContinue = false;
    this.nextState = 'standby';
  }
}

askCurrentQuestion() {
  const q = this.questions[this.currentQuestionIndex];
  if (!q) return;
  this.speechText(q, this.preset_voice_normal);
  this.fancyLogger.logMessage(q);
}

recordAnswer(button) {
  if (button === this.yesButton) {
    this.groupStats[this.currentQuestionIndex].yes += 1;
    this.answerSound.currentTime = 0;
    this.answerSound.play().catch(() => {});
  }
  if (button === this.noButton) {
    this.groupStats[this.currentQuestionIndex].no += 1;
    this.answerSound.currentTime = 0;
    this.answerSound.play().catch(() => {});
  } 
}

goToNextQuestion() {
  this.currentQuestionIndex += 1;

  if (this.currentQuestionIndex < this.questions.length) {
    this.nextState = 'ask-question';
  } else {
    this.nextState = 'show-result';
  }
}

_handleButtonReleased(button, simulated = false) {
  const btn = Number(button);
  this.buttonStates[btn] = 0;
  if (!this.waitingForUserInput) return;
  this.fancyLogger.logMessage(`released: btn${btn}`);

  if (btn === this.powerButton) {
    const now = Date.now();
    if (now - this.lastPowerToggleMs < 300) {
      this.fancyLogger.logWarning('Ignored duplicate power release event');
      return;
    }
    this.lastPowerToggleMs = now;
    this.togglePower();
    return;
  }

  if (!this.isOn) {
    this.fancyLogger.logWarning('Machine OFF: press btn0 to start');
    return;
  }

  this.dialogFlow('released', btn);
}

_handleButtonLongPressed(button, simulated = false) {
  const btn = Number(button);
  if (!this.waitingForUserInput) return;
  if (!this.isOn) return;
  this.fancyLogger.logMessage(`longpress: btn${btn}`);

  if (btn === this.controlButton) {
    this.dialogFlow('longpress', btn);
  }
}



    //permet de montrer les résultats
    showResult() {
      const endings = {
        A: {
          yes: 'Pool A ending: the group mostly agreed.',
          no: 'Pool A ending: the group mostly disagreed.',
        },
        B: {
          yes: 'Pool B ending: strong collective affirmation.',
          no: 'Pool B ending: strong collective rejection.',
        },
        C: {
          yes: 'Pool C ending: unified positive response.',
          no: 'Pool C ending: unified negative response.',
        },
      };

      let totalYes = 0;
      let totalNo = 0;

      let mostConsensualIndex = -1;
      let highestAgreement = -1;

      let mostRejectedIndex = -1;
      let highestNoVotes = -1;

      this.groupStats.forEach((stats, index) => {
        const yes = stats.yes || 0;
        const no = stats.no || 0;
        const total = yes + no;

        totalYes += yes;
        totalNo += no;

        if (total > 0) {
          const agreement = Math.max(yes, no) / total;
          if (agreement > highestAgreement) {
            highestAgreement = agreement;
            mostConsensualIndex = index;
          }
        }

        if (no > highestNoVotes) {
          highestNoVotes = no;
          mostRejectedIndex = index;
        }
      });

      const majority = totalYes > totalNo ? 'yes' : 'no';
      const poolKey = endings[this.activePool] ? this.activePool : 'A';
      const selectedEnding = endings[poolKey][majority];

      const consensualQuestionNumber =
        mostConsensualIndex >= 0 ? mostConsensualIndex + 1 : 1;
      const rejectedQuestionNumber = mostRejectedIndex >= 0 ? mostRejectedIndex + 1 : 1;

      this.fancyLogger.logMessage(`Total YES: ${totalYes}`);
      this.fancyLogger.logMessage(`Total NO: ${totalNo}`);
      this.fancyLogger.logMessage(`Selected ending: ${selectedEnding}`);
      this.fancyLogger.logMessage(
        `Most consensual question index: ${mostConsensualIndex >= 0 ? mostConsensualIndex + 1 : 'none'}`,
      );
      this.fancyLogger.logMessage(
        `Most rejected question index: ${mostRejectedIndex >= 0 ? mostRejectedIndex + 1 : 'none'}`,
      );

      const finalMessage = `${selectedEnding} The most consensual question was question ${consensualQuestionNumber}. The most rejected question was question ${rejectedQuestionNumber}.`;
      this.speechText(finalMessage, this.preset_voice_normal);
    }



  /* CONTRÔLE DU DIALOGUE */
  startDialog() {
    this.waitingForUserInput = true;
    this.dialogStarted = true;
    this.isOn = false;
    this.nextState = 'standby';
    this.ledsAllOff();
    this.fancyLogger.logMessage('Ready. Press btn0 to power ON and start welcome.');
  }

  /* FLUX DU DIALOGUE */
  /**
   * Fonction principale du flux de dialogue
   * @param {string} eventType - Type d'événement ('default', 'pressed', 'released', 'longpress')
   * @param {number} button - Numéro du bouton (0-9)
   * @private
   */
  dialogFlow(eventType = 'default', button = -1) {
    if (!this.performPreliminaryTests()) {
      // premiers tests avant de continuer vers les règles
      return;
    }
    this.stateUpdate();
    //fonction pour les question 


    /**
     * ═══════════════════════════════════════════════════════════════════════════
     * Flow du DIALOGUE - Guide visuel du flux de conversation
     * ═══════════════════════════════════════════════════════════════════════════
     *
     * initialisation → welcome → choose-color ─┬→ choose-blue → can-speak → count-press → toomuch → enough-pressed
     *                                           │
     *                                           └→ choose-yellow ──┘ (boucle vers choose-color)
     *
     * CONCEPTS CLÉS DE DIALOGUE DÉMONTRÉS:
     * ✓ Progression linéaire: États qui s'enchaînent (initialisation → welcome)
     * ✓ Embranchement: Le choix de l'utilisateur crée différents chemins (choose-color se divise selon le bouton)
     * ✓ Boucles: La conversation peut retourner à des états précédents (choose-yellow boucle)
     * ✓ Mémoire d'état: Le système se souvient des interactions précédentes (buttonPressCounter)
     * ✓ Initiative système: La machine parle sans attendre d'entrée (can-speak)
     *
     * MODIFIEZ LE DIALOGUE CI-DESSOUS - Ajoutez de nouveaux états dans le switch/case
     * ═══════════════════════════════════════════════════════════════════════════
     */

    switch (this.nextState) {
      case 'standby':
        this.fancyLogger.logMessage('STATE: standby');
        break;

      case 'welcome':
        this.fancyLogger.logMessage('STATE: welcome');
        this.speechText(
          'Bienvenue. Appuie sur bouton 1 une, deux ou trois fois pour choisir le pool de questions, puis attends une seconde.',
          this.preset_voice_normal,
        );
        this.nextState = 'wait-start';
        this.shouldContinue = true;
        this.fancyLogger.logMessage('Introduction en cours...');
        break;

      case 'wait-start':
        this.fancyLogger.logMessage(
          `STATE: wait-start event=${eventType} button=${button}`,
        );
        if (eventType === 'released' && button === this.controlButton) {
          this.poolClickCount += 1;
          this.fancyLogger.logMessage(`btn1 click count: ${this.poolClickCount}`);
          if (this.poolSelectionTimeout) {
            clearTimeout(this.poolSelectionTimeout);
          }
          this.poolSelectionTimeout = setTimeout(() => {
            if (this.poolClickCount === 1) {
              this.activePool = 'A';
            } else if (this.poolClickCount === 2) {
              this.activePool = 'B';
            } else {
              this.activePool = 'C';
            }
            this.fancyLogger.logMessage(`Selected pool: ${this.activePool}`);
            this.initQuestions();
            this.poolClickCount = 0;
            this.poolSelectionTimeout = null;
            this.nextState = 'ask-question';
            this.goToNextState();
          }, 1000);
        }
        break;

      case 'ask-question':
        this.fancyLogger.logMessage(
          `STATE: ask-question (Q${this.currentQuestionIndex + 1})`,
        );
        this.askCurrentQuestion();
        this.nextState = 'wait-answer';
        break;

      case 'wait-answer':
        this.fancyLogger.logMessage(
          `STATE: wait-answer event=${eventType} button=${button}`,
        );
        if (eventType === 'released' && (button === this.yesButton || button === this.noButton)) {
          this.recordAnswer(button);
          break;
        }

        if (eventType === 'longpress' && button === this.controlButton) {
          this.askCurrentQuestion(); // repeat
          break;
        }

        if (eventType === 'released' && button === this.controlButton) {
          this.fancyLogger.logMessage('btn1 short -> next question');
          this.goToNextQuestion();   // next
          this.goToNextState();
        }
        break;
      case 'show-result':
        this.fancyLogger.logMessage('STATE: show-result');
        this.showResult();
        break;

      default:
        this.fancyLogger.logWarning(
          `Sorry but State: "${this.nextState}" has no case defined`,
        );
    }
    
  }

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * Autres fonctions
   * ═══════════════════════════════════════════════════════════════════════════
   */

  /**
   *  fonction shorthand pour dire un texte avec la voix prédéfinie
   *  @param {string} _text le texte à dire
   */
  speakNormal(_text) {
    // appelé pour dire un texte
    this.speechText(_text, this.preset_voice_normal);
  }

  /**
   *  fonction shorthand pour forcer la transition vers l'état suivant dans le flux de dialogue
   *  @param {number} delay - le délai optionnel en millisecondes
   * @private
   */
  goToNextState(delay = 0) {
    if (delay > 0) {
      setTimeout(() => {
        this.dialogFlow();
      }, delay);
    } else {
      this.dialogFlow();
    }
  }

  /**
   * Effectuer des tests préliminaires avant de continuer avec le flux de dialogue
   * @returns {boolean} true si tous les tests passent, false sinon
   * @private
   */
  performPreliminaryTests() {
    if (this.dialogStarted === false) {
      this.fancyLogger.logWarning('not started yet, press Start Machine');
      return false;
    }
    if (this.waitingForUserInput === false) {
      this._handleUserInputError();
      return false;
    }
    // vérifier qu'aucune parole n'est active
    if (this.speechIsSpeaking === true) {
      this.fancyLogger.logWarning(
        'im speaking, please wait until i am finished',
      );
      return false;
    }
    if (
      this.nextState === '' ||
      this.nextState === null ||
      this.nextState === undefined
    ) {
      this.fancyLogger.logWarning('nextState is empty or undefined');
      return false;
    }

    return true;
  }

  stateUpdate() {
    this.lastState = this.nextState;
    // Mettre à jour l'affichage de l'état
    if (this.stateDisplay) {
      this.stateDisplay.textContent = this.nextState;
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * Overrides de TalkMachine
   * ═══════════════════════════════════════════════════════════════════════════
   */
  /**
   * override de _handleButtonPressed de TalkMachine
   * @override
   * @protected
   */
  _handleButtonPressed(button, simulated = false) {
    this.buttonStates[button] = 1;
    if (this.waitingForUserInput) {
      // this.dialogFlow('pressed', button);
    }
  }

  /**
   * override de _handleTextToSpeechEnded de TalkMachine
   * @override
   * @protected
   */
  _handleTextToSpeechEnded() {
    this.fancyLogger.logSpeech('speech ended');
    if (this.shouldContinue) {
      // aller à l'état suivant après la fin de la parole
      this.shouldContinue = false;
      this.goToNextState();
    }
  }

  /**
   * Gérer l'erreur d'input utilisateur
   * @protected
   */
  _handleUserInputError() {
    this.fancyLogger.logWarning('user input is not allowed at this time');
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * Fonctions pour le simulateur
   * ═══════════════════════════════════════════════════════════════════════════
   */

  /**
   * Gérer les boutons test UI du simulateur
   * @param {number} button - index du bouton
   * @override
   * @protected
   */
  _handleTesterButtons(button) {
    switch (button) {
      case 1:
        this.ledsAllChangeColor('yellow');
        break;
      case 2:
        this.ledsAllChangeColor('green', 1);
        break;
      case 3:
        this.ledsAllChangeColor('pink', 2);
        break;
      case 4:
        this.ledChangeRGB(0, 255, 100, 100);
        this.ledChangeRGB(1, 0, 100, 170);
        this.ledChangeRGB(2, 0, 0, 170);
        this.ledChangeRGB(3, 150, 170, 70);
        this.ledChangeRGB(4, 200, 160, 0);
        break;

      default:
        this.fancyLogger.logWarning('no action defined for button ' + button);
    }
  }
}



window.addEventListener('DOMContentLoaded', () => {
  const dialogMachine = new DialogMachine();
});

//CODE PROJET
/*
// array 5 question 
poser 1 une question - appeler question 1 
récupérer 

*/ 

