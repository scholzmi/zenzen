document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');
    const titleElement = document.querySelector('.block-title');

    // Game State
    let gameBoard = [], score = 0, highscore = 0;
    let figuresInSlots = [null, null, null];
    let selectedFigure = null, selectedSlotIndex = -1;
    const TOUCH_Y_OFFSET = -30;
    let gameConfig = {};
    const GRID_SIZE = 9;
    let isDragging = false;
    let lastTap = 0, tapTimeout = null;
    const doubleTapDelay = 300;
    let isMoveScheduled = false;
    let lastEvent = null;
    let currentPreviewCells = [];
    let currentZonkProbability = 0;
    let specialEvents = {};
    let imageList = [];
    let currentThemeIndex = -1;
    let titleTapCount = 0;
    let titleTapTimer = null;
    let themeErrorCounter = 0;
    let lastPreviewX = null;
    let lastPreviewY = null;
    let isComboChainActive = false;
    let isCurrentSetFromCombo = false;
    let comboSetClearedLines = 0;
    let currentClearingPreviewCells = [];


    // Variables for Board Gestures
    let boardTapCount = 0;
    let boardTapTimer = null;
    let boardTapHoldTimer = null;
    let isAdjustingOpacity = false;
    let startY = 0;
    let startOpacity = 0;

    // =======================================================
    // THEME-FUNKTIONEN
    // =======================================================

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
        // Formatiere das aktuelle Datum als "MM-DD" String für den Vergleich.
        // `getMonth()` ist 0-basiert, daher +1. `padStart` sorgt für die führende Null.
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentDay = String(now.getDate()).padStart(2, '0');
        const currentDateStr = `${currentMonth}-${currentDay}`;

        for (const special of specialEvents.specials) {
            const { startDate, endDate, background, name } = special;

            // Fall 1: Normaler Zeitraum innerhalb eines Jahres (z.B. 10-20 bis 11-03)
            if (startDate <= endDate) {
                if (currentDateStr >= startDate && currentDateStr <= endDate) {
                    console.log(`Special Event "${name}" ist aktiv!`);
                    return background;
                }
            }
            // Fall 2: Zeitraum über den Jahreswechsel (z.B. 12-29 bis 01-03)
            else {
                // Bedingung: (aktuelles Datum ist zwischen Start und Ende des Jahres) ODER (aktuelles Datum ist zwischen Anfang des Jahres und Ende)
                if (currentDateStr >= startDate || currentDateStr <= endDate) {
                    console.log(`Special Event "${name}" (Jahreswechsel) ist aktiv!`);
                    return background;
                }
            }
        }

        return null; // Kein Special-Event aktiv
    }


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

    // ...
    const gameWrapper = document.querySelector('.game-wrapper');
    let componentOpacity = parseFloat(getCookie('componentOpacity')) || 0.8;
    // ...

    function updateOpacity(newOpacity) {
        componentOpacity = Math.max(0.00, Math.min(1.0, newOpacity));
        document.documentElement.style.setProperty('--component-bg-a', componentOpacity);
        setCookie('componentOpacity', componentOpacity, 365);
    }

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

        // Prüft auf Doppelklick/Doppeltippen
        if (timesince < doubleTapDelay && timesince > 0) {
            // Ein zweiter Tap kam schnell genug
            if (tapTimeout) {
                clearTimeout(tapTimeout); // Verhindert, dass der Drag-Start vom ersten Tap ausgelöst wird
                tapTimeout = null;
            }
            rotateFigureInSlot(parseInt(targetSlot.dataset.slotId, 10));
            lastTap = 0; // Setzt den Tap-Timer zurück, um "Dreifach-Taps" zu vermeiden
            return;
        }

        // Dies ist der erste Tap. Wir warten einen kurzen Moment, bevor wir den Drag starten,
        // um zu sehen, ob ein zweiter Tap folgt.
        lastTap = now;
        tapTimeout = setTimeout(() => {
            document.body.style.cursor = 'none';
            const event = e.touches ? e.touches[0] : e;
            handleDragStart(event, targetSlot);
            tapTimeout = null;
        }, 150); // Eine kleine Verzögerung von 150ms. Fühlt sich noch direkt an.
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
        document.body.style.cursor = 'none';
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
                    // 1. Figur drehen
                    selectedFigure.form = rotateFigure90Degrees(selectedFigure.form);

                    // 2. Neuzeichnung der Vorschau direkt erzwingen.
                    // Wir verwenden die zuletzt gespeicherten Koordinaten (lastPreviewX/Y), um die 
                    // Vorschau an der aktuellen Mausposition neu zu zeichnen.
                    if (lastPreviewX !== null && lastPreviewY !== null) {
                        drawPreview(selectedFigure, lastPreviewX, lastPreviewY);
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

        if (cellX === lastPreviewX && cellY === lastPreviewY) {
            isMoveScheduled = false;
            return; // Nichts zu tun
        }

        lastPreviewX = cellX;
        lastPreviewY = cellY;

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
        document.body.style.cursor = 'auto'; // Stellt den normalen Mauszeiger wieder her
        if (!isDragging) return;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / cellSize);
        const cellY = Math.round(yPos / cellSize);

        // Positionen zurücksetzen
        lastPreviewX = null;
        lastPreviewY = null;

        placeFigure(selectedFigure, cellX, cellY);
        document.querySelector('.figure-slot.dragging')?.classList.remove('dragging');
        selectedFigure = null;
        selectedSlotIndex = -1;
        isDragging = false;
        drawGameBoard();
    }

    function rotateFigure90Degrees(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).map(row => row.reverse());
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        if (!canPlace(figure, placeX, placeY)) return;

        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.category;
        }));

        const clearResult = clearFullLines();
        const rowsClearedCount = clearResult.rows.length;
        const colsClearedCount = clearResult.cols.length;

        // --- NEUE, DYNAMISCHE PUNKTEBERECHNUNG ---

        // A: Punkte der platzierten Figur (aus config.json)
        const figureBasePoints = figure.points || 0;

        // B: Neue, dynamische Punkte für geplatzte Linien, basierend auf deiner Formel
        let linePoints = 0;
        if (rowsClearedCount > 0 || colsClearedCount > 0) {
            // Zählt die Blöcke der platzierten Figur (z.B. 9 für einen 3x3 Block)
            const figureCellCount = figure.form.flat().reduce((sum, cell) => sum + cell, 0);

            // "Cross-Bonus": Gibt 1, wenn Reihen UND Spalten platzen, sonst 0
            const crossBonus = (rowsClearedCount > 0 && colsClearedCount > 0) ? 1 : 0;

            // Der Basiswert für die Potenzierung
            const basiswert = rowsClearedCount + colsClearedCount + crossBonus + (figureCellCount / 10);

            // Die finale Berechnung, gerundet auf eine ganze Zahl
            linePoints = Math.round(Math.pow(basiswert, 2) * 100);
        }

        const points = figureBasePoints + linePoints;

        // --- ENDE DER NEUEN BERECHNUNG ---

        // Diese Variable wird für die Combo-Ketten-Logik weiterhin benötigt
        const clearedLines = rowsClearedCount + colsClearedCount;

        if (isCurrentSetFromCombo) {
            comboSetClearedLines += clearedLines;
        }

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

        const allSlotsAreEmpty = figuresInSlots.every(f => f === null);

        if (isCurrentSetFromCombo && allSlotsAreEmpty) {
            if (comboSetClearedLines >= 1) {
                console.log(`KETTE LÄUFT WEITER! (${comboSetClearedLines} Linien im Set geplatzt) Nächste Runde ist garantiert eine Combo.`);
                isComboChainActive = true;
            } else {
                console.log("KETTE GERISSEN! Keine Reihe beim letzten Set geplatzt.");
                isComboChainActive = false;
            }
        }

        if (allSlotsAreEmpty) {
            generateNewFigures();
        }

        if (isGameOver()) {
            handleGameOver();
        }
    }

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

    function generateJokerFigures() {
        if (!gameConfig.figures || !gameConfig.figures.joker) return;
        const jokerPool = gameConfig.figures.joker;
        for (let i = 0; i < 3; i++) {
            let figureData = { ...getWeightedRandomFigure(jokerPool) };
            let figure = { ...figureData, form: parseShape(figureData.shape), category: 'joker' };
            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) {
                figure.form = rotateFigure90Degrees(figure.form);
            }
            figuresInSlots[i] = figure;
            drawFigureInSlot(i);
        }
        if (isGameOver()) {
            handleGameOver();
        }
    }

    function getWeightedRandomFigure(pool) {
        const totalWeight = pool.reduce((sum, figure) => sum + (figure.probability || 1), 0);
        let random = Math.random() * totalWeight;
        for (const figure of pool) {
            random -= (figure.probability || 1);
            if (random <= 0) return figure;
        }
        return pool[pool.length - 1];
    }

    function generateNewFigures() {
        comboSetClearedLines = 0;
        isCurrentSetFromCombo = false;
        console.log("Aktuelle Zonk-Wahrscheinlichkeit:", currentZonkProbability.toFixed(4));
        const { jokerProbability, comboProbability, combos, figures } = gameConfig;

        if (isComboChainActive || Math.random() < (comboProbability || 0)) {
            if (isComboChainActive) {
                console.log("Combo-Kette ist aktiv, erzwinge neue Combo-Auslosung...");
            }

            for (let attempt = 0; attempt < 20; attempt++) {
                const selectedCombo = getWeightedRandomFigure(combos);
                const figureNamesInSet = selectedCombo.set;

                const findFigureDataByName = (name) => {
                    for (const category of ['normal', 'zonk', 'joker']) {
                        const found = figures[category].find(f => f.name === name);
                        if (found) return { ...found, category };
                    }
                    return null;
                };

                const figuresInCombo = figureNamesInSet.map(findFigureDataByName);

                if (figuresInCombo.some(f => f === null)) {
                    console.error("Eine Figur im Combo-Set wurde nicht in der config.json gefunden:", figureNamesInSet);
                    continue;
                }

                const parsedFiguresInCombo = figuresInCombo.map(figureData => ({
                    ...figureData,
                    form: parseShape(figureData.shape)
                }));

                parsedFiguresInCombo.forEach(figure => {
                    const rotations = Math.floor(Math.random() * 4);
                    for (let r = 0; r < rotations; r++) {
                        figure.form = rotateFigure90Degrees(figure.form);
                    }
                });

                if (canComboBePlaced(parsedFiguresInCombo, gameBoard)) {
                    console.log(`Passendes Combo-Set gefunden (Versuch ${attempt + 1}):`, figureNamesInSet.join(', '));
                    isCurrentSetFromCombo = true;

                    let shuffledCombo = [...parsedFiguresInCombo];
                    for (let i = shuffledCombo.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffledCombo[i], shuffledCombo[j]] = [shuffledCombo[j], shuffledCombo[i]];
                    }

                    for (let i = 0; i < 3; i++) {
                        figuresInSlots[i] = shuffledCombo[i];
                        drawFigureInSlot(i);
                    }

                    if (isGameOver()) {
                        handleGameOver();
                    }
                    return;
                }
            }
            console.log("Nach 20 Versuchen kein platzierbares Combo-Set gefunden. Fallback zur normalen Logik.");
            isComboChainActive = false;
        }

        // FALLBACK
        let isPlaceableSet = false;
        let newFigures = [];
        do {
            newFigures = [];
            for (let i = 0; i < 3; i++) {
                let pool, category;
                const rand = Math.random();
                if (rand < currentZonkProbability) {
                    pool = gameConfig.figures.zonk;
                    category = 'zonk';
                } else if (rand < jokerProbability + currentZonkProbability) {
                    pool = gameConfig.figures.joker;
                    category = 'joker';
                } else {
                    pool = gameConfig.figures.normal;
                    category = 'normal';
                }
                let figureData = { ...getWeightedRandomFigure(pool) };
                let figure = { ...figureData, form: parseShape(figureData.shape), category: category };
                const rotations = Math.floor(Math.random() * 4);
                for (let r = 0; r < rotations; r++) {
                    figure.form = rotateFigure90Degrees(figure.form);
                }
                newFigures.push(figure);
            }
            if (newFigures.some(fig => canFigureBePlacedAnywhere(fig))) {
                isPlaceableSet = true;
            }
        } while (!isPlaceableSet);

        for (let i = 0; i < 3; i++) {
            figuresInSlots[i] = newFigures[i];
            drawFigureInSlot(i);
        }
        const increment = gameConfig.zonkProbabilityIncrementPerRound || 0;
        const max = gameConfig.zonkProbabilityMax || 1;
        currentZonkProbability = Math.min(currentZonkProbability + increment, max);
        drawGameBoard();
        if (isGameOver()) {
            handleGameOver();
        }
    }

    /**
 * Prüft, ob eine Figur an einer bestimmten Position auf einem GEGEBENEN Spielfeld platziert werden kann.
 * Anders als die globale `canPlace`, arbeitet diese mit einem übergebenen Board-Zustand.
 * @param {Array<Array<number>>} figureForm - Die 2D-Matrix der Figur.
 * @param {number} startX - Die X-Koordinate zum Platzieren.
 * @param {number} startY - Die Y-Koordinate zum Platzieren.
 * @param {Array<Array<number>>} boardState - Der zu prüfende Spielfeld-Zustand.
 * @returns {boolean} - True, wenn die Platzierung gültig ist.
 */
    function canPlaceOnBoard(figureForm, startX, startY, boardState) {
        for (let y = 0; y < figureForm.length; y++) {
            for (let x = 0; x < figureForm[y].length; x++) {
                if (figureForm[y][x] === 1) {
                    const boardX = startX + x;
                    const boardY = startY + y;
                    if (boardX < 0 || boardX >= GRID_SIZE || boardY < 0 || boardY >= GRID_SIZE || boardState[boardY][boardX] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /**
     * Erzeugt einen NEUEN Spielfeld-Zustand, indem eine Figur platziert wird.
     * Wichtig: Modifiziert nicht das Original-Board, um hypothetische Tests zu ermöglichen.
     * @param {Array<Array<number>>} figureForm - Die zu platzierende Figur.
     * @param {number} startX - Die X-Koordinate.
     * @param {number} startY - Die Y-Koordinate.
     * @param {Array<Array<number>>} originalBoard - Der Ausgangszustand des Spielfelds.
     * @returns {Array<Array<number>>} - Der neue Zustand des Spielfelds.
     */
    function createNewBoardState(figureForm, startX, startY, originalBoard) {
        const newBoard = originalBoard.map(row => [...row]); // Tiefe Kopie erstellen
        for (let y = 0; y < figureForm.length; y++) {
            for (let x = 0; x < figureForm[y].length; x++) {
                if (figureForm[y][x] === 1) {
                    newBoard[startY + y][startX + x] = 1; // Inhalt ist für den Test egal, nur "besetzt"
                }
            }
        }
        return newBoard;
    }

    /**
     * Prüft rekursiv, ob ein ganzes Set von Figuren nacheinander auf dem Feld platziert werden kann.
     * @param {Array<Object>} figuresToPlace - Ein Array von Figuren-Objekten, die platziert werden sollen.
     * @param {Array<Array<number>>} currentBoardState - Der aktuelle Zustand des Spielfelds.
     * @returns {boolean} - True, wenn das gesamte Set platziert werden kann.
     */
    function canComboBePlaced(figuresToPlace, currentBoardState) {
        // Erfolgsbedingung: Wenn keine Figuren mehr zu platzieren sind, haben wir es geschafft.
        if (figuresToPlace.length === 0) {
            return true;
        }

        const currentFigure = figuresToPlace[0];
        const remainingFigures = figuresToPlace.slice(1);

        // Prüfe jede mögliche Rotation der aktuellen Figur
        let formToCheck = currentFigure.form;
        for (let r = 0; r < 4; r++) {
            // Prüfe jede mögliche Position auf dem Brett
            for (let y = 0; y <= GRID_SIZE - formToCheck.length; y++) {
                for (let x = 0; x <= GRID_SIZE - formToCheck[0].length; x++) {

                    if (canPlaceOnBoard(formToCheck, x, y, currentBoardState)) {
                        // Wenn wir sie platzieren können, erstelle ein hypothetisches neues Brett
                        const nextBoardState = createNewBoardState(formToCheck, x, y, currentBoardState);

                        // Und prüfe rekursiv, ob der Rest der Figuren auf dieses NEUE Brett passt
                        if (canComboBePlaced(remainingFigures, nextBoardState)) {
                            return true; // Erfolg! Die ganze Kette war platzierbar.
                        }
                    }
                }
            }
            formToCheck = rotateFigure90Degrees(formToCheck); // Nächste Rotation versuchen
        }

        // Wenn alle Rotationen und Positionen für die aktuelle Figur fehlschlagen, ist dieses Set nicht platzierbar.
        return false;
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

    function isGameOver() {
        return figuresInSlots.every(figure => {
            if (!figure) return true;
            let currentForm = figure.form;
            for (let i = 0; i < 4; i++) {
                for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                    for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                        if (canPlace({ form: currentForm }, x, y)) return false;
                    }
                }
                currentForm = rotateFigure90Degrees(currentForm);
            }
            return true;
        });
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

        // Wichtig: Linien auf dem Spielfeld leeren
        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));

        // Die rohen Daten zurückgeben, die Berechnung erfolgt jetzt in placeFigure
        return {
            rows: rows,
            cols: cols
        };
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
        // Alte Vorschau der Figur entfernen
        currentPreviewCells.forEach(cell => {
            cell.classList.remove('preview', 'invalid');

            // NEU: Entferne die Farb-Klassen nur, wenn die Zelle NICHT bereits belegt ist.
            // Belegte Zellen müssen ihre Farbe behalten.
            if (!cell.classList.contains('occupied')) {
                cell.classList.remove('color-normal', 'color-joker', 'color-zonk');
            }
        });
        currentPreviewCells = [];

        // Alten "Platzen"-Effekt von den Zellen entfernen
        currentClearingPreviewCells.forEach(cell => {
            cell.classList.remove('clearing-preview');
            cell.style.transform = '';
        });
        currentClearingPreviewCells = [];


        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        const canBePlaced = canPlace(figure, placeX, placeY);

        // Vorschau für die Figur selbst zeichnen
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

        // Wenn die Figur platzierbar ist, prüfe, welche Reihen/Spalten platzen würden
        if (canBePlaced) {
            const hypotheticalBoard = gameBoard.map(row => [...row]);
            figure.form.forEach((row, y) => {
                row.forEach((block, x) => {
                    if (block === 1) {
                        hypotheticalBoard[placeY + y][placeX + x] = 1;
                    }
                });
            });

            const rowsToClear = [];
            const colsToClear = [];
            for (let y = 0; y < GRID_SIZE; y++) {
                if (hypotheticalBoard[y].every(cell => cell !== 0)) {
                    rowsToClear.push(y);
                }
            }
            for (let x = 0; x < GRID_SIZE; x++) {
                if (hypotheticalBoard.every(row => row[x] !== 0)) {
                    colsToClear.push(x);
                }
            }

            const applyClearingEffect = (x, y) => {
                const cell = gameBoardElement.children[y * GRID_SIZE + x];
                if (!currentClearingPreviewCells.includes(cell)) {
                    cell.classList.add('clearing-preview');
                    currentClearingPreviewCells.push(cell);
                }
            };

            rowsToClear.forEach(y => {
                for (let x = 0; x < GRID_SIZE; x++) applyClearingEffect(x, y);
            });
            colsToClear.forEach(x => {
                for (let y = 0; y < GRID_SIZE; y++) applyClearingEffect(x, y);
            });
        }
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

    assignEventListeners();
    document.addEventListener('keydown', handleKeyPress);

    async function startGame() {
        await loadResources();
        applyTheme();
        initializeGame();
    }

    startGame();
});