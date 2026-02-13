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
    this.waitingForUserInput = true
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
    this.preset_voice_normal = [190, 1, 0.8];
    this.answerSound = new Audio('./sounds/sound-2.mp3');
    this.nextSound = new Audio('./sounds/sound.mp3');
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
        "Un ami s’est senti humilié par une remarque, il te demande de ne plus inviter cette personne aux moments de groupe. Tu acceptes ?",
        "Si un ami te confie quelque chose de très grave et que tu penses que quelqu’un peut être en danger, est-ce que tu en parles à une personne de confiance ou à un professionnel même s’il te demande de garder le secret ?",
      ],
      C: [
        "Au restaurant, ton plat a un vrai problème, est-ce que tu le dis clairement au serveur ?",
        "Quelqu’un a une mauvaise haleine ou une odeur forte qui gêne, est-ce que tu lui dis directement, en privé ?",
        "Un proche te propose un plan qui ne te plaît pas, est-ce que tu dis non tout de suite sans inventer d’excuse ?",
        "Quelqu’un te coupe la file ou te passe devant sans faire exprès, est-ce que tu le lui fais remarquer sur le moment ?",
        "Quelqu’un te demande ton avis sur un changement visible chez lui et tu trouves ça raté, est-ce que tu dis clairement que tu n’aimes pas ?",
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
  this.speakNormal(q);
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

 

  if (!this.isOn) {
    this.fancyLogger.logWarning('Machine OFF: press btn0 to start');
    return;
  }

  // Coupe immediatement la voix en cours des qu'un bouton de dialogue est relache.
  if (this.speechIsSpeaking === true) {
    this.speechCancel();
  }

  this.dialogFlow('released', btn);
}

_handleButtonLongPressed(button, simulated = false) {
  const btn = Number(button);
  this.fancyLogger.logMessage(`longpress: btn${btn}`);

  if (btn === this.powerButton) {
    if (this.isOn) this.togglePower();
    return;
  }

  if (!this.waitingForUserInput || !this.isOn) return;
  if (btn === this.controlButton) this.dialogFlow('longpress', btn);
}//longpress



    //permet de montrer les résultats
    showResult() {
      const endings = {
        A: {
          yes: "Le groupe a plutôt tendance à se protéger et à privilégier ses intérêts.",
          no: "Le groupe a plutôt tendance à être transparent et à assumer sa part.",
          tie: 'Fin pool A: le groupe est partage 50/50.',
        },
        B: {
          yes: "Le groupe privilégie la loyauté et la préservation des liens, même quand cela demande de s’adapter ou de se taire.",
          no: "Le groupe privilégie la clarté et les limites, même si cela crée de la tension ou déçoit quelqu’un.",
          tie: "Le groupe est partagé : il n’y a pas de tendance claire entre loyauté et vérité.",
        },
        C: {
          yes: "Le groupe a plutôt tendance à être direct et à dire les choses clairement, même si c’est inconfortable.",
          no: "Le groupe a plutôt tendance à être diplomate et à éviter les confrontations directes.",
          tie: 'Le groupe est partagé : pas de tendance nette entre franchise et diplomatie.',
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

      const majority = totalYes === totalNo ? 'tie' : (totalYes > totalNo ? 'yes' : 'no');
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

      const finalMessage = `${selectedEnding} La question la plus consensuelle etait la question ${consensualQuestionNumber}. La question la plus rejetee etait la question ${rejectedQuestionNumber}.`;
      this.speakNormal(finalMessage);
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
        this.speakNormal(
          `Bonjour.\Vous allez répondre à cinq questions. Appuyez sur le bouton blanc pour choisir le thème: un clic pour. groupe de travail, deux clics pour. Entre amis, trois clics. situations sociales.`,
          { direct: true },
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

        // Annonce du contexte choisi uniquement avant la première question
        if (this.currentQuestionIndex === 0) {
          let contextLabel = '';
          if (this.activePool === 'A') contextLabel = 'Travail de groupe';
          if (this.activePool === 'B') contextLabel = 'Entre amis';
          if (this.activePool === 'C') contextLabel = 'Situations sociales';

          this.speakNormal(
            `Vous avez choisi le thème ${contextLabel}. À partir de maintenant, un appui court sur le bouton 1... passe à la question suivante, un appui long répète la question.`,
            { direct: true },
          );

          this.shouldContinue = true;
          this.nextState = 'ask-question-intro';
          break;
        }

        this.askCurrentQuestion();
        this.nextState = 'wait-answer';
        break;

      case 'ask-question-intro':
        setTimeout(() => {
          this.askCurrentQuestion();
          this.nextState = 'wait-answer';
        }, 400);
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
          //ici mettre le son du bouton 
          this.nextSound.currentTime = 0;
          this.nextSound.play().catch(() => {});
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
  speakNormal(_text, options = {}) {
    if (options.direct === true) {
      this.speechText(_text, this.preset_voice_normal);
      return;
    }
    this.speakWithRhythm(_text, options);
  }

  /**
   * General speech wrapper with controlled pauses.
   * Splits text on ".", "?" and "!" to create natural rhythm.
   */
  speakWithRhythm(text, options = {}) {
    if (!text) return;
    const requestedPauseMs = Number.isFinite(options.pauseMs)
      ? options.pauseMs
      : 400;
    const pauseMs = Math.max(300, requestedPauseMs);

    const segments = text
      .split(/(?<=[\.\?\!])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let index = 0;

    const speakNext = () => {
      if (index >= segments.length) return;

      const segment = segments[index];
      index++;

      this.speechText(segment, this.preset_voice_normal);

      const originalHandler = this._handleTextToSpeechEnded.bind(this);

      this._handleTextToSpeechEnded = () => {
        this._handleTextToSpeechEnded = originalHandler;
        setTimeout(() => {
          speakNext();
        }, pauseMs);
      };
    };

    speakNext();
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
    /* if (this.speechIsSpeaking === true) {
      this.fancyLogger.logWarning(
        'im speaking, please wait until i am finished',
      );
      return false;
    } */
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
    const btn = Number(button);

    this.buttonStates[button] = 1;
    if (this.waitingForUserInput) {
      // this.dialogFlow('pressed', button);
    }

    if (btn === this.powerButton && !this.isOn) this.togglePower();
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
