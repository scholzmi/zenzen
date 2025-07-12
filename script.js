document.addEventListener('DOMContentLoaded', () => {
    // === DOM-Elemente ===
    const spielbrettElement = document.getElementById('spielbrett');
    const punkteElement = document.getElementById('punkte');
    const rekordNormalElement = document.getElementById('rekord-normal');
    const rekordSchwerElement = document.getElementById('rekord-schwer');
    const versionElement = document.getElementById('version-impressum');
    const aenderungsElement = document.getElementById('letzte-aenderung');
    const figurenSlots = document.querySelectorAll('.figur-slot');
    const jokerBoxenContainer = document.getElementById('dreh-joker-leiste');
    const hardModeSchalter = document.getElementById('hard-mode-schalter');
    const hardModeLabel = document.getElementById('hard-mode-label');
    const timerBar = document.getElementById('timer-bar');
    const refreshFigurenButton = document.getElementById('refresh-figuren-button');
    const rotateButton = document.getElementById('rotate-button');
    const punkteAnimationElement = document.getElementById('punkte-animation');
    const gameOverContainer = document.getElementById('game-over-container');
    const gameOverTitel = document.getElementById('game-over-titel');
    const gameOverText = document.getElementById('game-over-text');
    const neustartNormalBtn = document.getElementById('neustart-normal-btn');
    const neustartSchwerBtn = document.getElementById('neustart-schwer-btn');
    const confirmContainer = document.getElementById('confirm-container');
    const confirmJaBtn = document.getElementById('confirm-ja-btn');
    const confirmNeinBtn = document.getElementById('confirm-nein-btn');
    const anleitungModalContainer = document.getElementById('anleitung-modal-container');
    const anleitungModalInhalt = document.getElementById('anleitung-modal-inhalt');
    const anleitungLink = document.getElementById('anleitung-link');
    const anleitungSchliessenBtn = document.getElementById('anleitung-schliessen-btn');
    const colorSchemeSwitcher = document.getElementById('color-scheme-switcher');

    // === Spiel-Zustand ===
    let spielbrett = [], punkte = 0, rekordNormal = 0, rekordSchwer = 0, figurenInSlots = [null, null, null];
    let ausgewaehlteFigur = null, aktiverSlotIndex = -1, rundenZaehler = 0;
    let letztesZiel = { x: 4, y: 4 }, verbrauchteJoker = 0;
    let hatFigurGedreht = false, penaltyAktiviert = false;
    let istHardMode = false, timerInterval = null, verbleibendeZeit;
    let ersterZugGemacht = false;
    let lastMausEvent = null;
    let anzahlJoker;
    let ersterZug = true;
    let currentPanicCost = 0;
    let panicCooldown = 0;
    const isTouchDevice = 'ontouchstart' in window;
    let activeColorScheme = 'Herbst';

    // Mobile Steuerung Zustand
    let longPressTimer = null;
    let touchStartX, touchStartY, touchOffsetX, touchOffsetY;
    const longPressDuration = 200; 
    const touchMoveTolerance = 15;
    let lastTap = 0;

    // === Konfiguration ===
    let spielConfig = {};

    // ===================================================================================
    // INITIALISIERUNG
    // ===================================================================================

    async function spielStart() {
        spielbrettElement.classList.remove('zerbroeselt', 'panic-blinken');
        stopTimer();
        const savedMode = getCookie('hardMode');
        hardModeSchalter.checked = savedMode === 'true';
        istHardMode = hardModeSchalter.checked;
        updateHardModeLabel();
        abbrechen(); 

        const configGeladen = await ladeKonfiguration();
        if (!configGeladen) {
            spielbrettElement.innerHTML = '<p style="color:red;text-align:center;padding:20px;">Fehler: config.json konnte nicht geladen werden!</p>';
            return;
        }
        
        populateColorSchemeSwitcher();
        const savedScheme = getCookie('colorScheme') || Object.keys(spielConfig.colorSchemes)[0];
        colorSchemeSwitcher.value = savedScheme;
        activeColorScheme = savedScheme;

        applyColorScheme();
        await ladeAnleitung();

        const serverVersion = getGameSetting('gameVersion') || "1.0";
        const localVersion = getCookie('gameVersion');
        if (serverVersion !== localVersion) {
            setCookie('rekordNormal', '0', 365);
            setCookie('rekordSchwer', '0', 365);
            setCookie('gameVersion', serverVersion, 365);
        }

        if (document.body.classList.contains('boss-key-aktiv')) toggleBossKey();

        rekordNormal = parseInt(getCookie('rekordNormal') || '0', 10);
        rekordSchwer = parseInt(getCookie('rekordSchwer') || '0', 10);
        rekordNormalElement.textContent = rekordNormal;
        rekordSchwerElement.textContent = rekordSchwer;

        punkte = 0;
        punkteElement.textContent = punkte;
        rundenZaehler = 0;
        verbrauchteJoker = 0;
        hatFigurGedreht = false;
        penaltyAktiviert = false;
        ersterZugGemacht = false;
        lastMausEvent = null;
        aktiverSlotIndex = -1;
        ausgewaehlteFigur = null;
        ersterZug = true;
        currentPanicCost = getGameSetting('refreshPenaltyPoints');
        panicCooldown = 0;

        erstelleJokerLeiste();
        zeichneJokerLeiste();
        erstelleSpielfeld();
        zeichneSpielfeld();
        updatePanicButtonStatus();
        generiereNeueFiguren();
        wechsleZuNaechsterFigur();
        
        timerBar.style.setProperty('--timer-progress', '1');
    }

    function updateHardModeLabel() {
        hardModeLabel.textContent = hardModeSchalter.checked ? 'schwer' : 'normal';
    }

    async function ladeKonfiguration() {
        try {
            const antwort = await fetch('config.json?v=' + new Date().getTime());
            if (!antwort.ok) throw new Error(`Netzwerk-Antwort war nicht ok`);
            spielConfig = await antwort.json();
            if (versionElement) versionElement.textContent = spielConfig.version || "?.??";
            if (aenderungsElement && spielConfig.letzteAenderung) aenderungsElement.textContent = spielConfig.letzteAenderung;
            anzahlJoker = getGameSetting('numberOfJokers');
            const erstellePool = (p, kategorie) => Array.isArray(p) ? p.map(f => ({ ...f, kategorie, form: parseShape(f.shape) })) : [];
            spielConfig.figures.normalPool = erstellePool(spielConfig.figures.normal, 'normal');
            spielConfig.figures.zonkPool = erstellePool(spielConfig.figures.zonk, 'zonk');
            spielConfig.figures.jokerPool = erstellePool(spielConfig.figures.joker, 'joker');
            return true;
        } catch (error) {
            console.error('Fehler beim Laden der Konfiguration:', error);
            if (versionElement) versionElement.textContent = "Config Error!";
            return false;
        }
    }
    
    function applyColorScheme() {
        const scheme = spielConfig.colorSchemes[activeColorScheme];
        if (!scheme) return;
        const root = document.documentElement;

        if (isTouchDevice) {
            const mobileBgColor = getGameSetting('mobileBackgroundColor') || '#e0f7fa';
            root.style.setProperty('--background-image-url', 'none');
            root.style.setProperty('--background-color', mobileBgColor);
        } else {
            const bgImage = scheme.backgroundImage || 'bg.jpg';
            root.style.setProperty('--background-image-url', `url('img/${bgImage}')`);
            root.style.setProperty('--background-color', 'transparent');
        }

        Object.keys(scheme).forEach(key => {
            if (typeof scheme[key] === 'object' && key !== 'figurePalettes') {
                Object.keys(scheme[key]).forEach(subKey => {
                    root.style.setProperty(`--${key}-${subKey}`, scheme[key][subKey]);
                });
            } else if (key !== 'figurePalettes') {
                 root.style.setProperty(`--${key}`, scheme[key]);
            }
        });
        zeichneSpielfeld();
        for(let i=0; i<3; i++) zeichneFigurInSlot(i);
    }
    
    function populateColorSchemeSwitcher() {
        colorSchemeSwitcher.innerHTML = '';
        Object.keys(spielConfig.colorSchemes).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            colorSchemeSwitcher.appendChild(option);
        });
    }

    function getGameSetting(key) {
        const modus = istHardMode ? 'hard' : 'normal';
        if (spielConfig.gameSettings[key] !== undefined) {
            return spielConfig.gameSettings[key];
        }
        return spielConfig.gameSettings[modus][key];
    }

    async function ladeAnleitung() {
        if (!anleitungModalInhalt) return;
        try {
            const antwort = await fetch('anleitung.txt?v=' + new Date().getTime());
            if (!antwort.ok) throw new Error('Anleitung nicht gefunden');
            const text = await antwort.text();
            anleitungModalInhalt.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        } catch (error) {
            anleitungModalInhalt.textContent = 'Anleitung konnte nicht geladen werden.';
        }
    }

    // ===================================================================================
    // EVENT LISTENERS
    // ===================================================================================

    function eventListenerZuweisen() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') abbrechen();
            else if (e.key.toLowerCase() === 'b') toggleBossKey();
        });
        hardModeSchalter.addEventListener('change', () => {
            setCookie('hardMode', hardModeSchalter.checked, 365);
            if (punkte > 0) {
                 confirmContainer.classList.add('sichtbar');
                 confirmContainer.classList.remove('versteckt');
            } else {
                 spielStart();
            }
        });
        colorSchemeSwitcher.addEventListener('change', (e) => {
            activeColorScheme = e.target.value;
            setCookie('colorScheme', activeColorScheme, 365);
            applyColorScheme();
        });
        confirmJaBtn.addEventListener('click', () => {
            confirmContainer.classList.add('versteckt'), confirmContainer.classList.remove('sichtbar');
            spielStart();
        });
        confirmNeinBtn.addEventListener('click', () => {
            hardModeSchalter.checked = !hardModeSchalter.checked;
             setCookie('hardMode', hardModeSchalter.checked, 365);
            confirmContainer.classList.add('versteckt'), confirmContainer.classList.remove('sichtbar');
        });
        anleitungLink.addEventListener('click', (e) => {
            e.preventDefault();
            anleitungModalContainer.classList.add('sichtbar'), anleitungModalContainer.classList.remove('versteckt');
        });
        anleitungSchliessenBtn.addEventListener('click', () => {
            anleitungModalContainer.classList.add('versteckt'), anleitungModalContainer.classList.remove('sichtbar');
        });
        refreshFigurenButton.addEventListener('click', figurenNeuAuslosen);
        neustartNormalBtn.addEventListener('click', () => {
            hardModeSchalter.checked = false;
            setCookie('hardMode', false, 365);
            gameOverContainer.classList.add('versteckt'), gameOverContainer.classList.remove('sichtbar');
            spielStart();
        });
        neustartSchwerBtn.addEventListener('click', () => {
            hardModeSchalter.checked = true;
            setCookie('hardMode', true, 365);
            gameOverContainer.classList.add('versteckt'), gameOverContainer.classList.remove('sichtbar');
            spielStart();
        });

        if (isTouchDevice) {
            const spielWrapper = document.querySelector('.spiel-wrapper');
            spielWrapper.insertBefore(jokerBoxenContainer, spielbrettElement);
            rotateButton.style.display = 'none'; 
            figurenSlots.forEach((slot, index) => slot.addEventListener('click', () => waehleFigur(index)));
            spielbrettElement.addEventListener('touchstart', handleTouchStart);
            spielbrettElement.addEventListener('touchmove', handleTouchMove);
            spielbrettElement.addEventListener('touchend', handleTouchEnd);
        } else {
            spielbrettElement.addEventListener('mouseenter', handleBoardEnter);
            spielbrettElement.addEventListener('click', handleBoardClick);
            spielbrettElement.addEventListener('mousemove', handleBoardMove);
            spielbrettElement.addEventListener('mouseleave', handleBoardLeave);
            spielbrettElement.addEventListener('wheel', wechsleFigurPerScroll);
            spielbrettElement.addEventListener('contextmenu', dreheFigurPC);
        }
    }

    // ===================================================================================
    // TOUCH-SPEZIFISCHE HANDLER
    // ===================================================================================

    function handleTouchStart(e) {
        if (!ausgewaehlteFigur) return;
        e.preventDefault();
        
        const now = new Date().getTime();
        const timeSinceLastTap = now - lastTap;

        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
            clearTimeout(longPressTimer);
            dreheAktiveFigur();
            zeichneSpielfeld();
            zeichneVorschau(ausgewaehlteFigur, letztesZiel.x, letztesZiel.y);
            lastTap = 0; 
            return;
        }
        lastTap = now;

        const rect = spielbrettElement.getBoundingClientRect();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        
        const zellenGroesse = 40;
        let figurMittelpunktX = (letztesZiel.x * zellenGroesse) + (zellenGroesse / 2);
        let figurMittelpunktY = (letztesZiel.y * zellenGroesse) + (zellenGroesse / 2);

        touchOffsetX = figurMittelpunktX - (touchStartX - rect.left);
        touchOffsetY = figurMittelpunktY - (touchStartY - rect.top);

        handleBoardMove(e, true);
        
        longPressTimer = setTimeout(() => {
            if (navigator.vibrate) navigator.vibrate(50);
            platziereFigur(ausgewaehlteFigur, letztesZiel.x, letztesZiel.y);
        }, longPressDuration);
    }
    
    function handleTouchMove(e) {
        if (!ausgewaehlteFigur) return;
        e.preventDefault();
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const diffX = Math.abs(touchX - touchStartX);
        const diffY = Math.abs(touchY - touchStartY);

        if (diffX > touchMoveTolerance || diffY > touchMoveTolerance) {
            clearTimeout(longPressTimer);
        }
        handleBoardMove(e, true);
    }

    function handleTouchEnd(e) {
        clearTimeout(longPressTimer);
    }

    // ===================================================================================
    // STEUERUNG & SPIEL-LOGIK
    // ===================================================================================
    
    function waehleFigur(slotIndex) {
        if (aktiverSlotIndex === slotIndex) {
            abbrechen();
            return;
        }

        if (hatFigurGedreht) {
            verbrauchteJoker--;
            zeichneJokerLeiste();
        }

        if (slotIndex < 0 || slotIndex > 2 || !figurenInSlots[slotIndex]) {
            abbrechen();
            return;
        }

        aktiverSlotIndex = slotIndex;
        ausgewaehlteFigur = JSON.parse(JSON.stringify(figurenInSlots[aktiverSlotIndex]));
        hatFigurGedreht = false;
        
        if(isTouchDevice) rotateButton.classList.remove('versteckt');
        zeichneSlotHighlights();
        spielbrettElement.style.cursor = 'none';
        zeichneSpielfeld();
        zeichneVorschau(ausgewaehlteFigur, letztesZiel.x, letztesZiel.y);
    }
    
    function dreheAktiveFigur() {
        if (!ausgewaehlteFigur) return;
        if (ausgewaehlteFigur.isKolossFigur) return;
        if (!ausgewaehlteFigur.symmetrisch && !hatFigurGedreht) {
            if (verbrauchteJoker >= anzahlJoker) return;
            verbrauchteJoker++;
            hatFigurGedreht = true;
            zeichneJokerLeiste();
            if (verbrauchteJoker >= anzahlJoker) penaltyAktiviert = true;
        }
        ausgewaehlteFigur.form = dreheFigur90Grad(ausgewaehlteFigur.form);
    }

    function dreheFigurPC(e) { e.preventDefault(); dreheAktiveFigur(); handleBoardMove(e); }
    function dreheFigurMobile() { dreheAktiveFigur(); zeichneSpielfeld(); zeichneVorschau(ausgewaehlteFigur, letztesZiel.x, letztesZiel.y); }
    function handleBoardEnter(e) { if (!ausgewaehlteFigur) wechsleZuNaechsterFigur(); handleBoardMove(e); }
    function handleBoardLeave() { if (ausgewaehlteFigur) zeichneSpielfeld(); }
    
    function wechsleFigurPerScroll(e) {
        e.preventDefault();
        if (!ausgewaehlteFigur) return;
        if (ausgewaehlteFigur.isKolossFigur) return; 
        const richtung = e.deltaY > 0 ? 1 : -1;
        const verfuegbareIndices = figurenInSlots.map((fig, index) => fig ? index : -1).filter(index => index !== -1);
        if (verfuegbareIndices.length <= 1) return;
        
        const aktuellePosition = verfuegbareIndices.indexOf(aktiverSlotIndex);
        const neuePosition = (aktuellePosition + richtung + verfuegbareIndices.length) % verfuegbareIndices.length;
        waehleFigur(verfuegbareIndices[neuePosition]);
        handleBoardMove(lastMausEvent);
    }
    
    function wechsleZuNaechsterFigur() {
        let naechsterIndex = figurenInSlots.findIndex(fig => fig !== null);
        if (naechsterIndex !== -1) {
            waehleFigur(naechsterIndex);
            if(lastMausEvent) handleBoardMove(lastMausEvent);
        } else {
            abbrechen();
        }
    }

    function zeichneSlotHighlights() {
        figurenSlots.forEach((slot, index) => slot.classList.toggle('aktiver-slot', index === aktiverSlotIndex));
    }

    function updatePanicButtonStatus() {
        const wasPreviouslyDisabled = refreshFigurenButton.disabled;
        refreshFigurenButton.disabled = punkte < currentPanicCost || panicCooldown > 0;
        refreshFigurenButton.title = `Kosten: ${Math.round(currentPanicCost)} Punkte, Cooldown: ${panicCooldown} Runden`;

        if (wasPreviouslyDisabled && !refreshFigurenButton.disabled) {
            refreshFigurenButton.classList.add('wieder-aktiv');
            refreshFigurenButton.addEventListener('animationend', () => {
                refreshFigurenButton.classList.remove('wieder-aktiv');
            }, { once: true });
        }
    }

    function figurenNeuAuslosen() {
        abbrechen();
        stopTimer();
        
        const penaltyPoints = currentPanicCost;
        zeigePunkteAnimation(-penaltyPoints);
        
        punkte = Math.max(0, punkte - penaltyPoints);
        punkteElement.textContent = punkte;
        
        currentPanicCost += getGameSetting('panicCostIncrement');
        panicCooldown = getGameSetting('panicCooldownRounds');
        updatePanicButtonStatus();

        const blinkDuration = getGameSetting('panicBlinkDuration') || 1000;
        const blinkFrequency = getGameSetting('panicBlinkFrequency') || '0.2s';
        spielbrettElement.style.setProperty('--panic-blink-frequenz', blinkFrequency);
        spielbrettElement.classList.add('panic-blinken');
        
        setTimeout(() => {
            spielbrettElement.classList.remove('panic-blinken');
            const kolossFigur = berechneKolossFigur();
            if (kolossFigur) {
                figurenInSlots[0] = { ...kolossFigur, id: 0, cost: penaltyPoints };
                for(let i = 1; i < 3; i++) {
                     if (spielConfig.figures.jokerPool.length > 0) {
                        let zufallsFigur = spielConfig.figures.jokerPool[Math.floor(Math.random() * spielConfig.figures.jokerPool.length)];
                        const baseColor = spielConfig.colorSchemes[activeColorScheme].figurePalettes['joker']?.placed || spielConfig.colorSchemes[activeColorScheme].figurePalettes['default'].placed;
                        const variedColor = variiereFarbe(baseColor);
                        figurenInSlots[i] = { ...zufallsFigur, id: i, color: variedColor, kategorie: 'joker' };
                     } else {
                        figurenInSlots[i] = null;
                     }
                }
            } else {
                for(let i = 0; i < 3; i++) {
                     if (spielConfig.figures.jokerPool.length > 0) {
                        let zufallsFigur = spielConfig.figures.jokerPool[Math.floor(Math.random() * spielConfig.figures.jokerPool.length)];
                        const baseColor = spielConfig.colorSchemes[activeColorScheme].figurePalettes['joker']?.placed || spielConfig.colorSchemes[activeColorScheme].figurePalettes['default'].placed;
                        const variedColor = variiereFarbe(baseColor);
                        figurenInSlots[i] = { ...zufallsFigur, id: i, color: variedColor, kategorie: 'joker' };
                     } else {
                        figurenInSlots[i] = null;
                     }
                }
            }
            for(let i = 0; i < 3; i++) zeichneFigurInSlot(i);
            wechsleZuNaechsterFigur();
        }, blinkDuration);
    }
    
    function berechneKolossFigur() {
        let bestesFenster = { anzahl: 0, form: null };

        for (let startR = 0; startR <= 4; startR++) {
            for (let startC = 0; startC <= 4; startC++) {
                let aktuellesFensterAnzahl = 0;
                let aktuelleForm = Array.from({ length: 5 }, () => Array(5).fill(0));

                for (let r_offset = 0; r_offset < 5; r_offset++) {
                    for (let c_offset = 0; c_offset < 5; c_offset++) {
                        if (spielbrett[startR + r_offset][startC + c_offset] === 0) {
                            aktuellesFensterAnzahl++;
                            aktuelleForm[r_offset][c_offset] = 1;
                        }
                    }
                }

                if (aktuellesFensterAnzahl > bestesFenster.anzahl) {
                    bestesFenster = { anzahl: aktuellesFensterAnzahl, form: aktuelleForm };
                }
            }
        }
        
        if (bestesFenster.anzahl > 0) {
            let minR = -1, maxR = -1, minC = -1, maxC = -1;
            for(let r = 0; r < 5; r++) {
                for(let c = 0; c < 5; c++) {
                    if (bestesFenster.form[r][c] === 1) {
                        if(minR === -1) minR = r;
                        maxR = r;
                        if(minC === -1 || c < minC) minC = c;
                        if(maxC === -1 || c > maxC) maxC = c;
                    }
                }
            }
            
            if (minR === -1) return null;

            const zugeschnitteneForm = bestesFenster.form.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1));
            return { form: zugeschnitteneForm, isKolossFigur: true, color: 'super' };
        }

        return null;
    }


    function generiereNeueFiguren() {
        if(panicCooldown > 0) {
            panicCooldown--;
            updatePanicButtonStatus();
        }

        rundenZaehler++;
        const jokerProb = getGameSetting('jokerProbability'), zonkProb = getGameSetting('zonkProbability'),
              reductionInterval = getGameSetting('jokerProbabilityReductionInterval'), minimumJokerProb = getGameSetting('jokerProbabilityMinimum');
        const jokerReduktion = Math.floor((rundenZaehler - 1) / reductionInterval) * 0.01;
        const aktuelleJokerProb = Math.max(minimumJokerProb, jokerProb - jokerReduktion);
        
        for (let i = 0; i < 3; i++) {
            let zufallsFigur = null;
            let kategorie = 'normal';
            
            if (rundenZaehler === 1 && i === 0) {
                 if (spielConfig.figures.zonkPool.length > 0) {
                    zufallsFigur = spielConfig.figures.zonkPool[Math.floor(Math.random() * spielConfig.figures.zonkPool.length)];
                    kategorie = 'zonk';
                }
            } else {
                const zufallsZahl = Math.random();
                if (spielConfig.figures.zonkPool.length > 0 && zufallsZahl < zonkProb) {
                    zufallsFigur = spielConfig.figures.zonkPool[Math.floor(Math.random() * spielConfig.figures.zonkPool.length)];
                    kategorie = 'zonk';
                } else if (spielConfig.figures.jokerPool.length > 0 && zufallsZahl < zonkProb + aktuelleJokerProb) {
                    zufallsFigur = spielConfig.figures.jokerPool[Math.floor(Math.random() * spielConfig.figures.jokerPool.length)];
                    kategorie = 'joker';
                } else if (spielConfig.figures.normalPool.length > 0) {
                    zufallsFigur = spielConfig.figures.normalPool[Math.floor(Math.random() * spielConfig.figures.normalPool.length)];
                    kategorie = 'normal';
                }
            }
            
            if (zufallsFigur) {
                const baseColor = spielConfig.colorSchemes[activeColorScheme].figurePalettes[kategorie]?.placed || spielConfig.colorSchemes[activeColorScheme].figurePalettes['default'].placed;
                const variedColor = variiereFarbe(baseColor);
                figurenInSlots[i] = { ...zufallsFigur, id: i, color: variedColor, kategorie: kategorie };
                zeichneFigurInSlot(i);
            } else {
                figurenInSlots[i] = null;
            }
        }
        if (istSpielVorbei()) setTimeout(() => handleSpielEnde(true), 100);
    }

    function abbrechen() {
        if (ausgewaehlteFigur && hatFigurGedreht) {
            verbrauchteJoker--;
            zeichneJokerLeiste();
        }
        aktiverSlotIndex = -1;
        ausgewaehlteFigur = null;
        hatFigurGedreht = false;
        zeichneSlotHighlights();
        zeichneSpielfeld();
        spielbrettElement.style.cursor = 'default';
    }

    function platziereFigur(figur, startX, startY) {
        if (!figur) return;
        const figurHoehe = figur.form.length;
        const figurBreite = figur.form[0].length;
        const offsetX = Math.floor(figurBreite / 2);
        const offsetY = Math.floor(figurHoehe / 2);
        const platziereX = startX - offsetX;
        const platziereY = startY - offsetY;

        if (!kannPlatzieren(figur, platziereX, platziereY)) return;

        if (!ersterZugGemacht) {
            ersterZugGemacht = true;
            startTimer();
        } else if (!timerInterval) {
            resumeTimer();
        }
        if (navigator.vibrate && !isTouchDevice) navigator.vibrate(50);

        figur.form.forEach((reihe, y) => reihe.forEach((block, x) => {
            if (block === 1) {
                if(figur.isKolossFigur) {
                    spielbrett[platziereY + y][platziereX + x] = getGradientColor(x, y, figurBreite, figurHoehe);
                } else {
                    spielbrett[platziereY + y][platziereX + x] = figur.color;
                }
            }
        }));
        
        const blockAnzahl = figur.form.flat().reduce((a, b) => a + b, 0);
        let punktMultiplier = 1;
        if (figur.kategorie === 'normal') punktMultiplier = 2;
        else if (figur.kategorie === 'zonk') punktMultiplier = 5;
        const figurenPunkte = blockAnzahl * punktMultiplier;
        
        const alterSlotIndex = aktiverSlotIndex;
        
        if (penaltyAktiviert) {
            aktiviereJokerPenalty();
            verbrauchteJoker = 0;
            zeichneJokerLeiste();
            penaltyAktiviert = false;
        }
        
        const linienPunkte = leereVolleLinien();
        let gesamtPunkteGewinn = figurenPunkte + linienPunkte;
        
        if (figur.isKolossFigur && figur.cost) {
            gesamtPunkteGewinn = Math.min(gesamtPunkteGewinn, figur.cost);
        }

        punkte += gesamtPunkteGewinn;
        punkteElement.textContent = punkte;
        zeigePunkteAnimation(gesamtPunkteGewinn);
        updatePanicButtonStatus();
        
        figurenInSlots[alterSlotIndex] = null;
        zeichneFigurInSlot(alterSlotIndex);
        
        aktiverSlotIndex = -1;
        ausgewaehlteFigur = null;
        hatFigurGedreht = false; 
        if (isTouchDevice) rotateButton.style.display = 'none';
        zeichneSlotHighlights();
        zeichneSpielfeld();
        spielbrettElement.style.cursor = 'default';

        if (figurenInSlots.every(f => f === null)) {
            generiereNeueFiguren();
        }

        if (istSpielVorbei()) {
            setTimeout(() => handleSpielEnde(true), 100);
        } else {
            wechsleZuNaechsterFigur();
        }
    }

    function handleBoardMove(e, mitOffset = false) {
        if (!ausgewaehlteFigur) return;
        lastMausEvent = e;
    
        let { x, y } = mitOffset ? getZielKoordinatenMitOffset(e) : getZielKoordinaten(e);
    
        const figurHoehe = ausgewaehlteFigur.form.length;
        const figurBreite = ausgewaehlteFigur.form[0].length;
        const offsetX = Math.floor(figurBreite / 2);
        const offsetY = Math.floor(figurHoehe / 2);
    
        x = Math.max(offsetX, x);
        y = Math.max(offsetY, y);
    
        x = Math.min(8 - (figurBreite - 1 - offsetX), x);
        y = Math.min(8 - (figurHoehe - 1 - offsetY), y);
    
        letztesZiel = { x, y };
    
        zeichneSpielfeld();
        zeichneVorschau(ausgewaehlteFigur, letztesZiel.x, letztesZiel.y);
    }

    function handleBoardClick(e) {
        if (!ausgewaehlteFigur) return;
        platziereFigur(ausgewaehlteFigur, getZielKoordinaten(e).x, getZielKoordinaten(e).y);
    }
    
    function toggleBossKey() { document.body.classList.toggle('boss-key-aktiv'); if (document.body.classList.contains('boss-key-aktiv')) { stopTimer(); abbrechen(); } else { resumeTimer(); } }
    
    function startTimer() {
        const timerDuration = getGameSetting('timerDuration');
        verbleibendeZeit = timerDuration;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            verbleibendeZeit--;
            const progress = (verbleibendeZeit / timerDuration);
            timerBar.style.setProperty('--timer-progress', `${progress}`);
            if (verbleibendeZeit <= 0) {
                stopTimer();
                platziereStrafsteine(getGameSetting('timerPenaltyCount'));
                timerBar.style.setProperty('--timer-progress', '1');
                if (istSpielVorbei()) {
                    handleSpielEnde(true);
                }
            }
        }, 1000);
    }

    function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
    function resumeTimer() { if (ersterZugGemacht && !timerInterval && punkte > 0) startTimer(); }
    
    function platziereStrafsteine(anzahl) {
        const leereZellen = [];
        spielbrett.forEach((reihe, y) => reihe.forEach((zelle, x) => { if (zelle === 0) leereZellen.push({ x, y }); }));
        leereZellen.sort(() => 0.5 - Math.random());
        const anzahlZuPlatzieren = Math.min(anzahl, leereZellen.length);
        for (let i = 0; i < anzahlZuPlatzieren; i++) spielbrett[leereZellen[i].y][leereZellen[i].x] = 'blocker';
        zeichneSpielfeld();
    }
    
    function parseShape(shapeCoords) { if (!shapeCoords || shapeCoords.length === 0) return [[]]; let tempMatrix = Array.from({ length: 5 }, () => Array(5).fill(0)); let minRow = 5, maxRow = -1, minCol = 5, maxCol = -1; shapeCoords.forEach(coord => { const row = Math.floor((coord - 1) / 5); const col = (coord - 1) % 5; if (row < 5 && col < 5) { tempMatrix[row][col] = 1; minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row); minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col); } }); if (maxRow === -1) return []; return tempMatrix.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1)); }
    function dreheFigur90Grad(matrix) { return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).map(row => row.reverse()); }
    function istSpielVorbei() { for (const figurSlot of figurenInSlots) { if (figurSlot && figurSlot.form.length > 0 && figurSlot.form[0].length > 0) { let aktuelleForm = figurSlot.form; for (let i = 0; i < 4; i++) { const tempFigur = { form: aktuelleForm }; for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (kannPlatzieren(tempFigur, x, y)) return false; aktuelleForm = dreheFigur90Grad(aktuelleForm); } } } return true; }
    function kannPlatzieren(figur, startX, startY) { if (!figur || !figur.form || figur.form.length === 0 || figur.form[0].length === 0) return false; for (let y = 0; y < figur.form.length; y++) { for (let x = 0; x < figur.form[y].length; x++) { if (figur.form[y][x] === 1) { const bX = startX + x, bY = startY + y; if (bX < 0 || bX >= 9 || bY < 0 || bY >= 9 || spielbrett[bY][bX] !== 0) return false; } } } return true; }
    
    function leereVolleLinien() {
        let vR = [], vS = [];
        for (let y = 0; y < 9; y++) if (spielbrett[y].every(zelle => zelle !== 0)) vR.push(y);
        for (let x = 0; x < 9; x++) { let spalteVoll = true; for (let y = 0; y < 9; y++) if (spielbrett[y][x] === 0) { spalteVoll = false; break; } if (spalteVoll) vS.push(x); }
        const linien = vR.length + vS.length;
        if (linien > 0) { vR.forEach(y => spielbrett[y].fill(0)); vS.forEach(x => spielbrett.forEach(reihe => reihe[x] = 0)); }
        zeichneSpielfeld();
        return Math.pow(linien, 3) * 10;
    }

    function zeichneSpielfeld() {
        spielbrett.forEach((reihe, y) => {
            reihe.forEach((inhalt, x) => {
                const zelle = spielbrettElement.children[y * 9 + x];
                zelle.className = 'zelle';
                const figurePalettes = spielConfig.colorSchemes[activeColorScheme].figurePalettes;
                if(typeof inhalt === 'string' && inhalt.startsWith('#')) {
                    zelle.classList.add('belegt');
                    zelle.style.backgroundColor = inhalt;
                } else if (inhalt === 'blocker') {
                    zelle.classList.add('belegt', 'blocker');
                    zelle.style.backgroundColor = '';
                } else if (inhalt !== 0) {
                    zelle.classList.add('belegt');
                    zelle.style.backgroundColor = figurePalettes[inhalt]?.placed || figurePalettes['default'].placed;
                } else {
                     zelle.style.backgroundColor = '';
                }
            });
        });
    }

    function getGradientColor(x, y, width, height) {
        const from = [66, 133, 244];
        const to = [251, 188, 4];
        const factor = (x + y) / (Math.max(1, width - 1) + Math.max(1, height - 1));

        const r = Math.round(from[0] + factor * (to[0] - from[0]));
        const g = Math.round(from[1] + factor * (to[1] - from[1]));
        const b = Math.round(from[2] + factor * (to[2] - from[2]));
        return `rgb(${r},${g},${b})`;
    }
    
    function variiereFarbe(hex) {
        let { h, s, l } = hexToHsl(hex);
        h += (Math.random() * 20 - 10);
        s = Math.max(0, Math.min(100, s + (Math.random() * 20 - 10)));
        l = Math.max(20, Math.min(80, l + (Math.random() * 20 - 10)));
        return hslToHex(h, s, l);
    }
    
    function hexToHsl(H) {
      let r = 0, g = 0, b = 0;
      if (H.length == 4) {
        r = "0x" + H[1] + H[1];
        g = "0x" + H[2] + H[2];
        b = "0x" + H[3] + H[3];
      } else if (H.length == 7) {
        r = "0x" + H[1] + H[2];
        g = "0x" + H[3] + H[4];
        b = "0x" + H[5] + H[6];
      }
      r /= 255; g /= 255; b /= 255;
      let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin, h = 0, s = 0, l = 0;
      if (delta == 0) h = 0;
      else if (cmax == r) h = ((g - b) / delta) % 6;
      else if (cmax == g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
      l = (cmax + cmin) / 2;
      s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
      s = +(s * 100).toFixed(1);
      l = +(l * 100).toFixed(1);
      return {h, s, l};
    }

    function hslToHex(h, s, l) {
      s /= 100;
      l /= 100;
      let c = (1 - Math.abs(2 * l - 1)) * s,
          x = c * (1 - Math.abs((h / 60) % 2 - 1)),
          m = l - c/2,
          r = 0, g = 0, b = 0;
      if (0 <= h && h < 60) { r = c; g = x; b = 0; }
      else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
      else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
      else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
      else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
      else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
      r = Math.round((r + m) * 255).toString(16);
      g = Math.round((g + m) * 255).toString(16);
      b = Math.round((b + m) * 255).toString(16);
      if (r.length == 1) r = "0" + r;
      if (g.length == 1) g = "0" + g;
      if (b.length == 1) b = "0" + b;
      return "#" + r + g + b;
    }

    function zeichneVorschau(figur, startX, startY) {
        if (!figur) return;
        const figurHoehe = figur.form.length;
        const figurBreite = figur.form[0].length;
        const offsetX = Math.floor(figurBreite / 2);
        const offsetY = Math.floor(figurHoehe / 2);
        const platziereX = startX - offsetX;
        const platziereY = startY - offsetY;
        const kannFigurPlatzieren = kannPlatzieren(figur, platziereX, platziereY);
        
        zeichneSpielfeld();
        
        if (kannFigurPlatzieren) {
            const tempSpielbrett = spielbrett.map(row => [...row]);
            figur.form.forEach((reihe, y) => reihe.forEach((block, x) => { 
                if (block === 1) { 
                    const bY = platziereY + y, bX = platziereX + x; 
                    if (bY >= 0 && bY < 9 && bX >=0 && bX < 9) {
                        tempSpielbrett[bY][bX] = 1;
                    }
                } 
            }));
            zeichneLinienVorschau(tempSpielbrett);
        }

        figur.form.forEach((reihe, y) => reihe.forEach((block, x) => {
            if (block === 1) {
                const brettY = platziereY + y, brettX = platziereX + x;
                if (brettY < 9 && brettX < 9 && brettY >= 0 && brettX >= 0) {
                    const zelle = spielbrettElement.children[brettY * 9 + brettX];
                    if (figur.isKolossFigur) {
                        const color = getGradientColor(x, y, figurBreite, figurHoehe);
                        zelle.style.backgroundColor = kannFigurPlatzieren ? color.replace('rgb', 'rgba').replace(')', ', 0.5)') : 'rgba(233, 78, 119, 0.5)';
                    } else {
                        const figurePalettes = spielConfig.colorSchemes[activeColorScheme].figurePalettes;
                        zelle.style.backgroundColor = kannFigurPlatzieren ? (figurePalettes[figur.kategorie] || figurePalettes['default']).preview : 'rgba(233, 78, 119, 0.5)';
                    }
                }
            }
        }));
    }

    function zeichneLinienVorschau(tempSpielbrett) {
        let vR = [], vS = [];
        for (let y = 0; y < 9; y++) {
            if (tempSpielbrett[y].every(zelle => zelle !== 0)) {
                vR.push(y);
            }
        }
        for (let x = 0; x < 9; x++) {
            let spalteVoll = true;
            for (let y = 0; y < 9; y++) {
                if (tempSpielbrett[y][x] === 0) {
                    spalteVoll = false;
                    break;
                }
            }
            if (spalteVoll) {
                vS.push(x);
            }
        }
        vR.forEach(y => { for (let x = 0; x < 9; x++) spielbrettElement.children[y * 9 + x].classList.add('linie-vorschau'); });
        vS.forEach(x => { for (let y = 0; y < 9; y++) spielbrettElement.children[y * 9 + x].classList.add('linie-vorschau'); });
    }

    function zeigePunkteAnimation(wert) {
        if (!punkteAnimationElement || wert === 0) return;
        punkteAnimationElement.classList.remove('animieren');
        void punkteAnimationElement.offsetWidth;
        const text = wert > 0 ? `+${wert}` : wert;
        const farbe = wert > 0 ? '#34A853' : '#EA4335';
        punkteAnimationElement.textContent = text;
        punkteAnimationElement.style.color = farbe;
        const brettRect = spielbrettElement.getBoundingClientRect();
        const randX = brettRect.width * 0.2 + Math.random() * brettRect.width * 0.6;
        const randY = brettRect.height * 0.1 + Math.random() * brettRect.height * 0.2;
        punkteAnimationElement.style.left = `${randX}px`;
        punkteAnimationElement.style.top = `${randY}px`;
        punkteAnimationElement.classList.add('animieren');
    }

    function erstelleJokerLeiste() { jokerBoxenContainer.innerHTML = ''; for (let i = 0; i < anzahlJoker; i++) { const jokerBox = document.createElement('div'); jokerBox.classList.add('joker-box'); jokerBoxenContainer.appendChild(jokerBox); } }
    function zeichneJokerLeiste() { const jokerBoxen = jokerBoxenContainer.children; for (let i = 0; i < jokerBoxen.length; i++) { jokerBoxen[i].classList.toggle('verbraucht', i < verbrauchteJoker); jokerBoxen[i].classList.toggle('voll', i >= verbrauchteJoker); } }
    function zeichneFigurInSlot(index) {
        const slot = figurenSlots[index];
        const figur = figurenInSlots[index];
        slot.innerHTML = '';
        if (figur) {
            const container = document.createElement('div');
            container.classList.add('figur-container');
            const form = figur.form;
            container.style.gridTemplateRows = `repeat(${form.length}, 20px)`;
            container.style.gridTemplateColumns = `repeat(${form[0].length}, 20px)`;
            form.forEach((reihe, y) => reihe.forEach((block, x) => {
                const blockDiv = document.createElement('div');
                if (block === 1) {
                    blockDiv.classList.add('figur-block');
                    if (figur.isKolossFigur) {
                        blockDiv.style.backgroundColor = getGradientColor(x, y, form[0].length, form.length);
                    } else {
                        blockDiv.style.backgroundColor = figur.color;
                    }
                }
                container.appendChild(blockDiv);
            }));
            slot.appendChild(container);
        }
    }

    function aktiviereJokerPenalty() { platziereStrafsteine(getGameSetting('jokerPenaltyCount')); }
    function getZielKoordinaten(e) { const rect = spielbrettElement.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; const mausX = clientX - rect.left; const mausY = clientY - rect.top; return { x: Math.floor(mausX / 40), y: Math.floor(mausY / 40) }; }
    function getZielKoordinatenMitOffset(e) {
        const rect = spielbrettElement.getBoundingClientRect();
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        const mausX = (clientX - rect.left) + touchOffsetX;
        const mausY = (clientY - rect.top) + touchOffsetY;
        return { x: Math.floor(mausX / 40), y: Math.floor(mausY / 40) };
    }
    function setCookie(name, value, days) { let expires = ""; if (days) { const date = new Date(); date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000)); expires = "; expires=" + date.toUTCString(); } document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax"; }
    function getCookie(name) { const nameEQ = name + "="; const ca = document.cookie.split(';'); for (let i = 0; i < ca.length; i++) { let c = ca[i]; while (c.charAt(0) == ' ') c = c.substring(1, c.length); if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length); } return null; }
    
    function handleSpielEnde(checkAutoPanic = false) {
        if (checkAutoPanic) {
            const cost = currentPanicCost;
            if (punkte >= cost && panicCooldown === 0) {
                refreshFigurenButton.classList.add('auto-panic');
                const blinkDuration = getGameSetting('panicBlinkDuration') || 2000;
                const blinkFrequency = getGameSetting('panicBlinkFrequency') || '0.2s';
                spielbrettElement.style.setProperty('--panic-blink-frequenz', blinkFrequency);
                spielbrettElement.classList.add('panic-blinken');

                setTimeout(() => {
                    refreshFigurenButton.classList.remove('auto-panic');
                    spielbrettElement.classList.remove('panic-blinken');
                    if (istSpielVorbei()) figurenNeuAuslosen();
                }, blinkDuration);
                return;
            }
        }

        stopTimer();
        spielbrettElement.classList.add('zerbroeselt');
        
        setTimeout(() => {
            let rekord = istHardMode ? rekordSchwer : rekordNormal;
            let rekordCookieName = istHardMode ? 'rekordSchwer' : 'rekordNormal';
            if (punkte > rekord) {
                rekord = punkte;
                if (istHardMode) { rekordSchwerElement.textContent = rekord; rekordSchwer = rekord; }
                else { rekordNormalElement.textContent = rekord; rekordNormal = rekord; }
                setCookie(rekordCookieName, rekord, 365);
                gameOverTitel.textContent = 'Neuer Rekord!';
                gameOverText.textContent = `Du hast ${rekord} Punkte erreicht!`;
            } else {
                gameOverTitel.textContent = 'Spiel vorbei!';
                gameOverText.textContent = `Deine Punktzahl: ${punkte}`;
            }
            gameOverContainer.classList.add('sichtbar');
            gameOverContainer.classList.remove('versteckt');
        }, 3000);
    }
    
    function erstelleSpielfeld() { spielbrettElement.innerHTML = ''; spielbrett = Array.from({ length: 9 }, () => Array(9).fill(0)); for (let y = 0; y < 9; y++) { for (let x = 0; x < 9; x++) { const zelle = document.createElement('div'); zelle.classList.add('zelle'); zelle.style.setProperty('--delay', `${Math.random() * 2}s`); spielbrettElement.appendChild(zelle); } } }

    eventListenerZuweisen();
    spielStart();
});