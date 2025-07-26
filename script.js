document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements: Speichert alle wichtigen HTML-Elemente für den schnellen Zugriff.
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');
    const titleElement = document.querySelector('.block-title');

    // =======================================================
    // GAME STATE - Alle wichtigen Variablen, die den Spielzustand steuern.
    // =======================================================
    let gameBoard = []; // Ein 2D-Array (9x9), das das Spielfeld repräsentiert. 0 = leer.
    let score = 0; // Aktueller Punktestand der laufenden Runde.
    let highscore = 0; // Höchster erreichter Punktestand, wird aus einem Cookie geladen.
    let figuresInSlots = [null, null, null]; // Array, das die drei aktuell verfügbaren Spielfiguren enthält.
    let selectedFigure = null; // Die Figur, die der Spieler gerade per Drag & Drop bewegt.
    let selectedSlotIndex = -1; // Der Index (0, 1, oder 2) des Slots, aus dem die Figur genommen wurde.
    const TOUCH_Y_OFFSET = -30; // Ein Wert in Pixeln, um die Figur beim Ziehen über dem Finger anzuzeigen.
    let gameConfig = {}; // Ein Objekt, das nach dem Laden die gesamte config.json enthält.
    const GRID_SIZE = 9; // Definiert die Größe des Spielfelds (9x9).
    let isDragging = false; // Ein "Flag", das anzeigt, ob gerade eine Figur gezogen wird.
    let lastTap = 0; // Zeitstempel des letzten Taps, um Doppeltaps zu erkennen (zum Drehen der Figuren).
    const doubleTapDelay = 300; // Zeit in Millisekunden, innerhalb der ein Doppeltap erkannt wird.
    let isMoveScheduled = false; // Verhindert, dass die Vorschau-Funktion zu oft aufgerufen wird.
    let lastEvent = null; // Speichert das letzte Maus- oder Touch-Ereignis für die Vorschau.
    let currentPreviewCells = []; // Speichert die Zellen, die gerade als Vorschau eingefärbt sind.
    let currentZonkProbability = 0; // Die aktuelle Wahrscheinlichkeit, eine "Zonk"-Figur zu erhalten. Steigt mit jeder Runde.
    let specialEvents = {}; // Speichert nach dem Laden die special_events.json.
    let imageList = []; // Speichert nach dem Laden die Liste der normalen Hintergrundbilder aus bilder.json.
    let currentThemeIndex = -1; // Der Index des aktuell angezeigten Bildes aus der imageList.
    let titleTapCount = 0; // Zählt die Klicks auf den Titel (für den Joker-Cheat).
    let titleTapTimer = null; // Timer, um den titleTapCount zurückzusetzen.
    let themeErrorCounter = 0; // Zählt, wie viele Bilder hintereinander nicht geladen werden konnten.
    
    // Variablen für Gesten auf dem Spielbrett (z.B. Transparenz ändern)
    let boardTapCount = 0;
    let boardTapTimer = null;
    let boardTapHoldTimer = null;
    let isAdjustingOpacity = false;
    let startY = 0;
    let startOpacity = 0;
    let componentOpacity = 0.05;

    // =======================================================
    // THEME-FUNKTIONEN
    // =======================================================

    /**
     * Lädt externe Konfigurationsdateien (Events und Bilderliste).
     */
    async function loadResources() {
        try {
            const eventsResponse = await fetch('special_events.json?v=' + new Date().getTime());
            if (!eventsResponse.ok) throw new Error('special_events.json konnte nicht geladen werden.');
            specialEvents = await eventsResponse.json();
            console.log('Special Events erfolgreich geladen:', specialEvents);

            const imagesResponse = await fetch('bilder.json?v=' + new Date().getTime());
            if (!imagesResponse.ok) throw new Error('bilder.json konnte nicht geladen werden.');
            imageList = await imagesResponse.json();
            imageList.sort();
            console.log('Bilderliste erfolgreich geladen und sortiert:', imageList);

        } catch (error) {
            console.error('Fehler beim Laden der Ressourcen:', error);
        }
    }

    /**
     * Setzt das Hintergrundbild des Spiels.
     * @param {string} imageUrl - Der Pfad zum Bild, das geladen werden soll.
     */
    function setBackgroundImage(imageUrl) {
        const fallbackUrl = 'bg.png';
        const finalImageUrl = imageUrl || fallbackUrl;

        const img = new Image();
        img.src = finalImageUrl;

        img.onload = () => {
            themeErrorCounter = 0;
            console.log(`Hintergrund erfolgreich geladen: ${finalImageUrl}`);
            document.body.style.setProperty('--background-image', `url('${finalImageUrl}')`);
            updateThemeFromImage(finalImageUrl);
            setCookie('theme', finalImageUrl, 365);
        };

        img.onerror = () => {
            themeErrorCounter++;
            if (imageList.length > 0 && themeErrorCounter >= imageList.length) {
                console.error("Alle Bilder in der Liste konnten nicht geladen werden. Lade finales Fallback-Bild.");
                document.body.style.setProperty('--background-image', `url('${fallbackUrl}')`);
                updateThemeFromImage(fallbackUrl);
                themeErrorCounter = 0;
                return;
            }

            console.warn(`Hintergrund '${finalImageUrl}' nicht gefunden. Lade nächstes Bild.`);
            
            let failedIndex = imageList.indexOf(finalImageUrl);
            if (failedIndex === -1) {
                failedIndex = currentThemeIndex;
            }

            currentThemeIndex = (failedIndex + 1) % imageList.length;
            const nextImage = imageList[currentThemeIndex];
            setBackgroundImage(nextImage);
        };
    }
    
    /**
     * Prüft, ob ein Special-Event aktiv ist, basierend auf MM-DD Logik.
     * Kann auch Zeiträume über den Jahreswechsel (z.B. 12-29 bis 01-03) korrekt verarbeiten.
     * @returns {string|null} Die URL zum Hintergrundbild des Events oder null.
     */
    function checkForSpecialTheme() {
        if (!specialEvents.specials || !Array.isArray(specialEvents.specials)) {
            return null;
        }

        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = String(now.getDate()).padStart(2, '0');
        const currentDateStr = `${currentMonth}-${currentDay}`;

        for (const special of specialEvents.specials) {
            const { start, end, background, name } = special;
            
            if (start <= end) {
                if (currentDateStr >= start && currentDateStr <= end) {
                    console.log(`Special Event "${name}" ist aktiv!`);
                    return background;
                }
            } 
            else {
                if (currentDateStr >= start || currentDateStr <= end) {
                    console.log(`Special Event "${name}" (Jahreswechsel) ist aktiv!`);
                    return background;
                }
            }
        }
        
        return null;
    }

    /**
     * Wendet das passende Theme an (Special-Event, Cookie oder das nächste aus der Liste).
     * @param {boolean} [forceNext=false] - Wenn true, wird das nächste Theme aus der Liste geladen und die Event/Cookie-Prüfung übersprungen.
     */
    function applyTheme(forceNext = false) {
        const specialThemeUrl = checkForSpecialTheme();
        if (specialThemeUrl && !forceNext) {
            setBackgroundImage(specialThemeUrl);
            console.log("Special Event gefunden!");
            return;
        }

        const savedTheme = getCookie('theme');
        if (savedTheme && !forceNext) {
            const savedThemeIndex = imageList.indexOf(savedTheme);
            if (savedThemeIndex !== -1) {
                currentThemeIndex = savedThemeIndex;
                setBackgroundImage(savedTheme);
                console.log(`Gespeichertes Theme aus Cookie geladen: ${savedTheme}`);
                return;
            }
        }

        if (imageList.length > 0) {
            currentThemeIndex = (currentThemeIndex + 1) % imageList.length;
            const nextImage = imageList[currentThemeIndex];
            setBackgroundImage(nextImage);
            console.log(`Neues Theme gesetzt: ${nextImage}`);
        } else {
            setBackgroundImage(null);
        }
    }

    // =======================================================
    // SPIEL-INITIALISIERUNG UND RESTLICHE LOGIK
    // =======================================================

    /**
     * Startet oder resettet das Spiel.
     */
    async function initializeGame() {
        highscoreElement.classList.remove('pulsate', 'new-highscore-animation');
        gameBoardElement.classList.remove('crumble');

        if (Object.keys(gameConfig).length === 0) {
            const configLoaded = await loadConfiguration();
            if (!configLoaded) {
                document.body.innerHTML = "<h1>Fehler</h1><p>config.json ...</p>";
                return;
            }
        }
        currentZonkProbability = gameConfig.zonkProbability || 0;

        const serverVersion = gameConfig.gameVersion || "1.0";
        const localVersion = getCookie('gameVersion');
        if (serverVersion !== localVersion) {
            setCookie('highscore', '0', 365);
            setCookie('gameVersion', serverVersion, 365);
        }

        highscore = parseInt(getCookie('highscore') || '0', 10);
        highscoreElement.textContent = highscore;
        score = 0;
        scoreElement.textContent = score;

        createGameBoard();
        generateNewFigures();
    }

    /**
     * Lädt und verarbeitet die zentrale config.json.
     */
    async function loadConfiguration() {
        try {
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`Network response was not ok`);
            gameConfig = await response.json();
            if (versionInfoElement) versionInfoElement.textContent = gameConfig.version || "?.??";
            if (lastModificationElement) lastModificationElement.textContent = gameConfig.lastModification || "N/A";
            if (!gameConfig.figures || !gameConfig.figures.normal || !gameConfig.figures.zonk || !gameConfig.figures.joker) {
                throw new Error("Figurenpools in config.json sind nicht korrekt definiert.");
            }
            return true;
        } catch (error) { console.error('Error loading config:', error); return false; }
    }

    /**
     * Erstellt das 9x9 Spielfeld-Grid im HTML.
     */
    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        gameBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        const cellSize = gameBoardElement.clientWidth / GRID_SIZE;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.x = x;
                cell.dataset.y = y;
                cell.style.setProperty('--delay', Math.random());
                gameBoardElement.appendChild(cell);
            }
        }
        document.documentElement.style.setProperty('--figure-block-size', `${Math.max(10, cellSize / 2.5)}px`);
    }

    /**
     * Wandelt eine RGB-Farbe in HSL um.
     */
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    /**
     * Extrahiert eine Farbpalette aus dem Hintergrundbild und passt die CSS-Variablen an.
     * @param {string} imageUrl - Die URL des Bildes, aus dem die Farben extrahiert werden.
     */
    function updateThemeFromImage(imageUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = function () {
            const colorThief = new ColorThief();
            let palette = colorThief.getPalette(img, 8);

            function getColorBrightness(rgb) {
                return Math.sqrt(0.299 * (rgb[0] * rgb[0]) + 0.587 * (rgb[1] * rgb[1]) + 0.114 * (rgb[2] * rgb[2]));
            }

            palette.sort((a, b) => getColorBrightness(a) - getColorBrightness(b));
            
            const textColor = palette[0];
            const zonkColor = palette[1];
            const figureNormalColor = palette[2];
            const jokerColor = palette[3];
            const borderColor = palette[4];
            const accentColor = palette[5];
            const mainBgColor = palette[7];

            const [bgH, bgS, bgL] = rgbToHsl(mainBgColor[0], mainBgColor[1], mainBgColor[2]),
                [textH, textS, textL] = rgbToHsl(textColor[0], textColor[1], textColor[2]),
                [borderH, borderS, borderL] = rgbToHsl(borderColor[0], borderColor[1], borderColor[2]),
                [figH, figS, figL] = rgbToHsl(figureNormalColor[0], figureNormalColor[1], figureNormalColor[2]),
                [jokerH, jokerS, jokerL] = rgbToHsl(jokerColor[0], jokerColor[1], jokerColor[2]),
                [zonkH, zonkS, zonkL] = rgbToHsl(zonkColor[0], zonkColor[1], zonkColor[2]),
                [accentH, accentS, accentL] = rgbToHsl(accentColor[0], accentColor[1], accentColor[2]);

            const root = document.documentElement;
            root.style.setProperty('--component-bg-h', bgH); root.style.setProperty('--component-bg-s', bgS + '%'); root.style.setProperty('--component-bg-l', bgL + '%');
            root.style.setProperty('--text-h', textH); root.style.setProperty('--text-s', textS + '%'); root.style.setProperty('--text-l', textL + '%');
            root.style.setProperty('--border-h', borderH); root.style.setProperty('--border-s', borderS + '%'); root.style.setProperty('--border-l', borderL + '%');
            root.style.setProperty('--figure-normal-h', figH); root.style.setProperty('--figure-normal-s', figS + '%'); root.style.setProperty('--figure-normal-l', figL + '%');
            root.style.setProperty('--figure-joker-h', jokerH); root.style.setProperty('--figure-joker-s', jokerS + '%'); root.style.setProperty('--figure-joker-l', jokerL + '%');
            root.style.setProperty('--figure-zonk-h', zonkH); root.style.setProperty('--figure-zonk-s', zonkS + '%'); root.style.setProperty('--figure-zonk-l', zonkL + '%');
            root.style.setProperty('--accent-h', accentH); root.style.setProperty('--accent-s', accentS + '%'); root.style.setProperty('--accent-l', accentL + '%');
        };
    }

    /**
     * Weist allen interaktiven Elementen ihre Event-Listener zu.
     */
    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });

        if (titleElement) {
            titleElement.addEventListener('click', handleTitleTap);
        }

        gameBoardElement.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
        gameBoardElement.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
        gameBoardElement.addEventListener('touchend', handleBoardTouchEnd);
    }
    
    /**
     * Setzt die Deckkraft der Spielkomponenten (Game-Wrapper).
     * @param {number} newOpacity - Der neue Deckkraft-Wert (0.0 bis 1.0).
     */
    function updateOpacity(newOpacity) {
        componentOpacity = Math.max(0.00, Math.min(1.0, newOpacity));
        document.documentElement.style.setProperty('--component-bg-a', componentOpacity);
    }

    /**
     * Behandelt Tastatureingaben für Cheats und Steuerungen.
     * @param {KeyboardEvent} e - Das Key-Press-Event.
     */
    function handleKeyPress(e) {
        if (e.key === 'b') {
            const container = document.querySelector('.main-container');
            const footer = document.querySelector('footer');
            if (container) container.classList.toggle('boss-key-hidden');
            if (footer) footer.classList.toggle('boss-key-hidden');
        }
        if (e.key === 'j') {
            generateJokerFigures();
        }
        if (e.key === 't') {
            if (checkForSpecialTheme()) {
                console.log("Theme-Wechsel per 't' blockiert: Special-Event ist aktiv.");
                return;
            }
            applyTheme(true);
        }
    }

    /**
     * Sucht eine Figur anhand ihres Namens in allen Figurenpools (normal, joker, zonk).
     * @param {string} name - Der Name der zu suchenden Figur.
     * @returns {object|null} Das gefundene Figur-Datenobjekt (inkl. Kategorie) oder null.
     */
    function findFigureByName(name) {
        for (const category of ['normal', 'joker', 'zonk']) {
            const pool = gameConfig.figures[category];
            if (pool) {
                const found = pool.find(fig => fig.name === name);
                if (found) {
                    return { ...found, category: category };
                }
            }
        }
        console.error(`Figur mit dem Namen "${name}" wurde in keiner Kategorie gefunden!`);
        return null;
    }

    /**
     * Wählt ein zufälliges Element aus einem Pool basierend auf gewichteter Wahrscheinlichkeit.
     * Funktioniert für Figuren und Combo-Sets.
     * @param {Array<object>} pool - Ein Array von Objekten, die eine 'probability'-Eigenschaft haben.
     * @returns {object} Das ausgewählte Objekt aus dem Pool.
     */
    function getWeightedRandomItem(pool) {
        const totalWeight = pool.reduce((sum, item) => sum + (item.probability || 1), 0);
        let random = Math.random() * totalWeight;
        for (const item of pool) {
            random -= (item.probability || 1);
            if (random <= 0) return item;
        }
        return pool[pool.length - 1];
    }
    
    /**
     * Generiert drei neue Spielfiguren und stellt sicher, dass das Set platzierbar ist.
     */
    function generateNewFigures() {
        let newFigures = [];
        let isPlaceableSet = false;
        let useFallback = false; // NEU: Flag, um den Fallback zur normalen Logik zu steuern.

        const randCombo = Math.random();
        // --- 1. COMBO-VERSUCH ---
        if (gameConfig.combos && randCombo < (gameConfig.comboProbability || 0)) {
            console.log("🎲 Combo-Pfad wird versucht...");
            let comboFound = false;
            // Starte eine Schleife, die maximal 20 Mal versucht, eine passende Combo zu finden.
            for (let i = 0; i < 20; i++) {
                const selectedCombo = getWeightedRandomItem(gameConfig.combos);
                if (selectedCombo && selectedCombo.set) {
                    let tempFigures = selectedCombo.set.map(figureName => {
                        const figureData = findFigureByName(figureName);
                        if (!figureData) return null;
                        let figure = { ...figureData, form: parseShape(figureData.shape) };
                        // Figuren werden für die Prüfung NICHT zufällig gedreht, damit das Ergebnis konsistent ist.
                        return figure;
                    }).filter(f => f !== null);

                    // NEU: Prüfen, ob ALLE Figuren des Sets auf das Brett passen.
                    if (tempFigures.length === 3 && tempFigures.every(fig => canFigureBePlacedAnywhere(fig))) {
                        console.log(`✅ Passende Combo "${selectedCombo.set.join(', ')}" nach ${i + 1} Versuchen gefunden!`);
                        // Rotiere die Figuren erst jetzt, nachdem sie als passend validiert wurden.
                        newFigures = tempFigures.map(figure => {
                            const rotations = Math.floor(Math.random() * 4);
                            for (let r = 0; r < rotations; r++) {
                                figure.form = rotateFigure90Degrees(figure.form);
                            }
                            return figure;
                        });
                        comboFound = true;
                        break; // Beende die Schleife, da wir eine passende Combo haben.
                    }
                }
            }
            // Wenn nach 20 Versuchen keine passende Combo gefunden wurde...
            if (!comboFound) {
                console.log("❌ Nach 20 Versuchen keine passende Combo gefunden. Wechsle zur normalen Auslosung (Fallback).");
                useFallback = true;
            }
        }

        // --- 2. NORMALE AUSLOSUNG (wenn keine Combo ausgelöst wurde ODER der Combo-Fallback aktiv ist) ---
        if (!gameConfig.combos || randCombo >= (gameConfig.comboProbability || 0) || useFallback) {
            let isValidNormalSet = false;
            do {
                const { jokerProbability } = gameConfig;
                newFigures = [];
                for (let i = 0; i < 3; i++) {
                    let pool, category;
                    const rand = Math.random();
                    if (rand < currentZonkProbability) {
                        pool = gameConfig.figures.zonk;
                        category = 'zonk';
                    } else if (rand < (jokerProbability || 0) + currentZonkProbability) {
                        pool = gameConfig.figures.joker;
                        category = 'joker';
                    } else {
                        pool = gameConfig.figures.normal;
                        category = 'normal';
                    }
                    let figureData = { ...getWeightedRandomItem(pool) };
                    let figure = { ...figureData, form: parseShape(figureData.shape), category: category };
                    const rotations = Math.floor(Math.random() * 4);
                    for (let r = 0; r < rotations; r++) {
                        figure.form = rotateFigure90Degrees(figure.form);
                    }
                    newFigures.push(figure);
                }
                // Die normale Logik stellt sicher, dass MINDESTENS EINE Figur passt.
                if (newFigures.some(fig => canFigureBePlacedAnywhere(fig))) {
                    isValidNormalSet = true;
                }
            } while (!isValidNormalSet);
        }

        // --- 3. ZUWEISUNG UND ABSCHLUSS ---
        figuresInSlots = newFigures;
        for (let i = 0; i < 3; i++) {
            drawFigureInSlot(i);
        }

        // Erhöhe die Zonk-Wahrscheinlichkeit nur, wenn es eine normale Runde war.
        if (randCombo >= (gameConfig.comboProbability || 0) || useFallback) {
            const increment = gameConfig.zonkProbabilityIncrementPerRound || 0;
            const max = gameConfig.zonkProbabilityMax || 1;
            currentZonkProbability = Math.min(currentZonkProbability + increment, max);
        }
        
        drawGameBoard();
        if (isGameOver()) {
            handleGameOver();
        }
    }
    
    // ... (restlicher Code bleibt unverändert)

    function isGameOver() {
        return figuresInSlots.every(figure => {
            if (!figure) return true;
            let currentForm = figure.form;
            for (let i = 0; i < 4; i++) {
                for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                    for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                        if (canPlace({ form: currentForm }, x, y)) {
                            return false;
                        }
                    }
                }
                currentForm = rotateFigure90Degrees(currentForm);
            }
            return true;
        });
    }

    function handleGameOver() {
        gameBoardElement.classList.add('crumble');
        setTimeout(() => {
            const allCells = gameBoardElement.querySelectorAll('.cell.occupied');
            allCells.forEach(cell => {
                cell.className = 'cell';
            });
            gameBoardElement.classList.remove('crumble');
            initializeGame();
        }, 1600);
    }
    
    function parseShape(shapeCoords) {
        let tempMatrix = Array.from({ length: 5 }, () => Array(5).fill(0));
        let minRow = 5, maxRow = -1, minCol = 5, maxCol = -1;
        
        shapeCoords.forEach(coord => {
            const row = Math.floor((coord - 1) / 5);
            const col = (coord - 1) % 5;
            tempMatrix[row][col] = 1;
            minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
        });
        
        return tempMatrix.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1));
    }
    
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = `${name}=${value || ""}${expires}; path=/; SameSite=Lax; Secure`;
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let c of ca) {
            c = c.trim();
            if (c.startsWith(nameEQ)) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    async function startGame() {
        assignEventListeners();
        document.addEventListener('keydown', handleKeyPress);

        const gameWrapper = document.querySelector('.game-wrapper');
        updateOpacity(componentOpacity);
        if (gameWrapper) {
            gameWrapper.addEventListener('wheel', (event) => {
                event.preventDefault();
                if (event.deltaY < 0) {
                    updateOpacity(componentOpacity + 0.05);
                } else {
                    updateOpacity(componentOpacity - 0.05);
                }
            }, { passive: false });
        }

        await loadResources();
        applyTheme();
        initializeGame();
    }

    // Unveränderte Funktionen ab hier...
    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        if (!canPlace(figure, placeX, placeY)) return;

        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.category;
        }));

        const clearResult = clearFullLines();
        const points = clearResult.points + (figure.points || 0);

        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);

        if (score > highscore) {
            highscore = score;
            highscoreElement.textContent = highscore;
            setCookie('highscore', highscore, 365);
            
            highscoreElement.classList.add('new-highscore-animation');
            setTimeout(() => {
                highscoreElement.classList.remove('new-highscore-animation');
            }, 2000);
        }

        figuresInSlots[selectedSlotIndex] = null;
        drawFigureInSlot(selectedSlotIndex);
        if (figuresInSlots.every(f => f === null)) {
            generateNewFigures();
        }
        if (isGameOver()) {
            handleGameOver();
        }
    }
    function rotateFigure90Degrees(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).map(row => row.reverse());
    }
    function canPlace(figure, startX, startY) {
        for (let y = 0; y < figure.form.length; y++) {
            for (let x = 0; x < figure.form[y].length; x++) {
                if (figure.form[y][x] === 1) {
                    const boardX = startX + x;
                    const boardY = startY + y;
                    if (boardX < 0 || boardX >= GRID_SIZE || boardY < 0 || boardY >= GRID_SIZE || gameBoard[boardY][boardX] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    function canFigureBePlacedAnywhere(figure) {
        if (!figure) return false;
        let currentForm = figure.form;
        for (let i = 0; i < 4; i++) {
            for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                    if (canPlace({ form: currentForm }, x, y)) {
                        return true;
                    }
                }
            }
            currentForm = rotateFigure90Degrees(currentForm);
        }
        return false;
    }
    function clearFullLines() {
        let rows = [], cols = [];
        for (let y = 0; y < GRID_SIZE; y++) if (gameBoard[y].every(cell => cell !== 0)) rows.push(y);
        for (let x = 0; x < GRID_SIZE; x++) if (gameBoard.every(row => row[x] !== 0)) cols.push(x);

        const linesCleared = rows.length > 0 || cols.length > 0;
        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        
        return {
            points: Math.pow(rows.length + cols.length, 2) * 100,
            linesCleared: linesCleared
        };
    }
    function drawGameBoard() {
        gameBoard.forEach((row, y) => row.forEach((content, x) => {
            const cell = gameBoardElement.children[y * GRID_SIZE + x];
            cell.className = 'cell';
            if (content !== 0) {
                cell.classList.add('occupied', `color-${content}`);
            }
        }));
    }
    function drawPreview(figure, centerX, centerY) {
        currentPreviewCells.forEach(cell => {
            cell.classList.remove('preview', 'invalid');
            if (!cell.classList.contains('occupied')) {
                cell.classList.remove('color-normal', 'color-joker', 'color-zonk');
            }
        });
        currentPreviewCells = [];
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        const canBePlaced = canPlace(figure, placeX, placeY);
        figure.form.forEach((row, y) => {
            row.forEach((block, x) => {
                if (block === 1) {
                    const boardY = placeY + y;
                    const boardX = placeX + x;
                    if (boardY >= 0 && boardY < GRID_SIZE && boardX >= 0 && boardX < GRID_SIZE) {
                        const cell = gameBoardElement.children[boardY * GRID_SIZE + boardX];
                        cell.classList.add('preview');
                        if (canBePlaced) {
                            cell.classList.add(`color-${figure.category}`);
                        } else {
                            cell.classList.add('invalid');
                        }
                        currentPreviewCells.push(cell);
                    }
                }
            });
        });
    }
    function drawFigureInSlot(index) {
        const slot = figureSlots[index];
        const figure = figuresInSlots[index];
        slot.innerHTML = '';
        if (figure) {
            const container = document.createElement('div');
            container.classList.add('figure-container');
            const blockSize = 'var(--figure-block-size)';
            container.style.gridTemplateRows = `repeat(${figure.form.length}, ${blockSize})`;
            container.style.gridTemplateColumns = `repeat(${figure.form[0].length}, ${blockSize})`;
            figure.form.forEach(row => row.forEach(block => {
                const blockDiv = document.createElement('div');
                if (block === 1) {
                    blockDiv.classList.add('figure-block', `color-${figure.category}`);
                }
                container.appendChild(blockDiv);
            }));
            slot.appendChild(container);
        }
    }
    function showScoreAnimation(value) {
        if (!scoreAnimationElement || value === 0) return;
        scoreAnimationElement.textContent = `+${value}`;
        scoreAnimationElement.classList.remove('animate');
        void scoreAnimationElement.offsetWidth;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const randX = boardRect.width * (0.2 + Math.random() * 0.6);
        const randY = boardRect.height * (0.1 + Math.random() * 0.2);
        scoreAnimationElement.style.left = `${randX}px`;
        scoreAnimationElement.style.top = `${randY}px`;
        scoreAnimationElement.classList.add('animate');
    }
    function generateJokerFigures() {
        if (!gameConfig.figures || !gameConfig.figures.joker) return;
        const jokerPool = gameConfig.figures.joker;
        let newFigures = [];
        for (let i = 0; i < 3; i++) {
            let figureData = { ...getWeightedRandomItem(jokerPool) };
            let figure = { ...figureData, form: parseShape(figureData.shape), category: 'joker' };
            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) {
                figure.form = rotateFigure90Degrees(figure.form);
            }
            newFigures.push(figure);
        }
        figuresInSlots = newFigures;
        for (let i = 0; i < 3; i++) {
           drawFigureInSlot(i);
        }
        if (isGameOver()) {
            handleGameOver();
        }
    }
    function handleBoardTouchStart(e) {
        if (isDragging) return;
        boardTapCount++;
        if (boardTapTimer) clearTimeout(boardTapTimer);
        if (boardTapCount === 2) {
             e.preventDefault();
            boardTapHoldTimer = setTimeout(() => {
                isAdjustingOpacity = true;
                startY = e.touches[0].clientY;
                startOpacity = componentOpacity;
                boardTapCount = 0;
            }, 200);
        }
        boardTapTimer = setTimeout(() => {
             if (boardTapCount === 5) {
                e.preventDefault();
                applyTheme(true);
            }
            boardTapCount = 0;
        }, 300);
    }
    function handleBoardTouchMove(e) {
        if (isAdjustingOpacity) {
            e.preventDefault();
            const deltaY = startY - e.touches[0].clientY;
            const newOpacity = startOpacity + (deltaY / 400);
            updateOpacity(newOpacity);
        }
    }
    function handleBoardTouchEnd(e) {
        if (boardTapHoldTimer) clearTimeout(boardTapHoldTimer);
        if (isAdjustingOpacity) {
            e.preventDefault();
            isAdjustingOpacity = false;
        }
    }
    function handleTitleTap() {
        titleTapCount++;
        if (titleTapTimer) clearTimeout(titleTapTimer);
        if (titleTapCount === 5) {
            console.log("Cheat activated: Joker Figures");
            generateJokerFigures();
            titleTapCount = 0;
        } else {
            titleTapTimer = setTimeout(() => {
                titleTapCount = 0;
            }, 1500);
        }
    }
    function handleTapOrDragStart(e) {
        e.preventDefault();
        const targetSlot = e.currentTarget;
        const now = new Date().getTime();
        const timesince = now - lastTap;
        if (timesince < doubleTapDelay && timesince > 0) {
            clearTimeout(tapTimeout);
            rotateFigureInSlot(parseInt(targetSlot.dataset.slotId, 10));
            return;
        }
        lastTap = new Date().getTime();
        const event = e.touches ? e.touches[0] : e;
        handleDragStart(event, targetSlot);
    }
    function rotateFigureInSlot(slotIndex) {
        if (!figuresInSlots[slotIndex]) return;
        figuresInSlots[slotIndex].form = rotateFigure90Degrees(figuresInSlots[slotIndex].form);
        drawFigureInSlot(slotIndex);
        if (isGameOver()) {
            handleGameOver();
        }
    }
    function handleDragStart(event, targetSlot) {
        if (isDragging) return;
        const slotIndex = parseInt(targetSlot.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) return;
        isDragging = true;
        selectedSlotIndex = slotIndex;
        selectedFigure = JSON.parse(JSON.stringify(figuresInSlots[selectedSlotIndex]));
        targetSlot.classList.add('dragging');
        const handleKeyPressDuringDrag = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (selectedFigure) {
                    selectedFigure.form = rotateFigure90Degrees(selectedFigure.form);
                    if (lastEvent) {
                        updatePreviewOnFrame();
                    }
                }
            }
        };
        document.addEventListener('keydown', handleKeyPressDuringDrag);
        const moveHandler = (moveEvent) => {
            handleInteractionMove(moveEvent.touches ? moveEvent.touches[0] : moveEvent);
        };
        const endHandler = (endEvent) => {
            document.removeEventListener('keydown', handleKeyPressDuringDrag);
            document.removeEventListener('touchmove', moveHandler);
            document.removeEventListener('touchend', endHandler);
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', endHandler);
            handleInteractionEnd(endEvent.changedTouches ? endEvent.changedTouches[0] : endEvent);
        };
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        handleInteractionMove(event);
    }
    function updatePreviewOnFrame() {
        if (!lastEvent || !isDragging) {
            isMoveScheduled = false;
            return;
        }
        const boardRect = gameBoardElement.getBoundingClientRect();
        const event = lastEvent.touches ? lastEvent.touches[0] : lastEvent;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / boardRect.width * GRID_SIZE);
        const cellY = Math.round(yPos / boardRect.height * GRID_SIZE);
        drawPreview(selectedFigure, cellX, cellY);
        isMoveScheduled = false;
    }
    function handleInteractionMove(event) {
        lastEvent = event;
        if (!isMoveScheduled) {
            isMoveScheduled = true;
            window.requestAnimationFrame(updatePreviewOnFrame);
        }
    }
    function handleInteractionEnd(event) {
        if (!isDragging) return;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / cellSize);
        const cellY = Math.round(yPos / cellSize);
        placeFigure(selectedFigure, cellX, cellY);
        document.querySelector('.figure-slot.dragging')?.classList.remove('dragging');
        selectedFigure = null;
        selectedSlotIndex = -1;
        isDragging = false;
        drawGameBoard();
    }
    
    startGame();
});