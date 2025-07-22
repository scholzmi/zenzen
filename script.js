document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');

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

    // NEU: Variable für haptisches Feedback
    let lastVibratedCell = { x: -1, y: -1 };

    async function initializeGame() {
        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');

        // Nur beim allerersten Start die Konfiguration laden
        if (Object.keys(gameConfig).length === 0) {
            const configLoaded = await loadConfiguration();
            if (!configLoaded) {
                document.body.innerHTML = "<h1>Fehler</h1><p>config.json konnte nicht geladen werden oder ist fehlerhaft. Bitte stellen Sie sicher, dass die Datei existiert und valide ist.</p>";
                return;
            }
            updateThemeFromImage('bg.png'); // Hier color theme ausschalten
        }

        // Setzt die Zonk-Wahrscheinlichkeit für ein neues Spiel zurück
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
            h = s = 0; // achromatic
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
                return Math.sqrt(
                    0.299 * (rgb[0] * rgb[0]) +
                    0.587 * (rgb[1] * rgb[1]) +
                    0.114 * (rgb[2] * rgb[2])
                );
            }

            palette.sort((a, b) => getColorBrightness(a) - getColorBrightness(b));

            // Zuweisung ist jetzt zuverlässig, da die Palette sortiert ist
            const textColor = palette[0];
            const zonkColor = palette[1];         // NEU: Zonk bekommt eine sehr dunkle Farbe
            const figureNormalColor = palette[2]; // Normal bekommt eine dunkle Farbe
            const z1Color = palette[3];
            const z2Color = palette[4];
            const borderColor = palette[5];
            const jokerColor = palette[6];        // NEU: Joker bekommt eine helle Farbe
            const mainBgColor = palette[7];

            // Farben für Titel (teilweise Wiederverwendung für Kontrast)
            const z3Color = palette[4];
            const eColor = palette[6];
            const nColor = palette[2];

            // Alle Farben in HSL umwandeln
            const [bgH, bgS, bgL] = rgbToHsl(mainBgColor[0], mainBgColor[1], mainBgColor[2]);
            const [textH, textS, textL] = rgbToHsl(textColor[0], textColor[1], textColor[2]);
            const [borderH, borderS, borderL] = rgbToHsl(borderColor[0], borderColor[1], borderColor[2]);
            const [figH, figS, figL] = rgbToHsl(figureNormalColor[0], figureNormalColor[1], figureNormalColor[2]);
            const [jokerH, jokerS, jokerL] = rgbToHsl(jokerColor[0], jokerColor[1], jokerColor[2]); // NEU
            const [zonkH, zonkS, zonkL] = rgbToHsl(zonkColor[0], zonkColor[1], zonkColor[2]);     // NEU

            const [z1H, z1S, z1L] = rgbToHsl(z1Color[0], z1Color[1], z1Color[2]);
            const [z2H, z2S, z2L] = rgbToHsl(z2Color[0], z2Color[1], z2Color[2]);
            const [z3H, z3S, z3L] = rgbToHsl(z3Color[0], z3Color[1], z3Color[2]);
            const [eH, eS, eL] = rgbToHsl(eColor[0], eColor[1], eColor[2]);
            const [nH, nS, nL] = rgbToHsl(nColor[0], nColor[1], nColor[2]);

            // Die CSS-Variablen dynamisch überschreiben
            const root = document.documentElement;
            root.style.setProperty('--component-bg-h', bgH);
            root.style.setProperty('--component-bg-s', bgS + '%');
            root.style.setProperty('--component-bg-l', bgL + '%');

            root.style.setProperty('--text-h', textH);
            root.style.setProperty('--text-s', textS + '%');
            root.style.setProperty('--text-l', textL + '%');

            root.style.setProperty('--border-h', borderH);
            root.style.setProperty('--border-s', borderS + '%');
            root.style.setProperty('--border-l', borderL + '%');

            // HSL für alle Figurentypen setzen
            root.style.setProperty('--figure-normal-h', figH);
            root.style.setProperty('--figure-normal-s', figS + '%');
            root.style.setProperty('--figure-normal-l', figL + '%');

            root.style.setProperty('--figure-joker-h', jokerH); // NEU
            root.style.setProperty('--figure-joker-s', jokerS + '%'); // NEU
            root.style.setProperty('--figure-joker-l', jokerL + '%'); // NEU

            root.style.setProperty('--figure-zonk-h', zonkH);   // NEU
            root.style.setProperty('--figure-zonk-s', zonkS + '%');   // NEU
            root.style.setProperty('--figure-zonk-l', zonkL + '%');   // NEU

            // HSL-Variablen für den Titel setzen
            root.style.setProperty('--c-z1-h', z1H); root.style.setProperty('--c-z1-s', z1S + '%'); root.style.setProperty('--c-z1-l', z1L + '%');
            root.style.setProperty('--c-z2-h', z2H); root.style.setProperty('--c-z2-s', z2S + '%'); root.style.setProperty('--c-z2-l', z2L + '%');
            root.style.setProperty('--c-z3-h', z3H); root.style.setProperty('--c-z3-s', z3S + '%'); root.style.setProperty('--c-z3-l', z3L + '%');
            root.style.setProperty('--c-e-h', eH); root.style.setProperty('--c-e-s', eS + '%'); root.style.setProperty('--c-e-l', eL + '%');
            root.style.setProperty('--c-n-h', nH); root.style.setProperty('--c-n-s', nS + '%'); root.style.setProperty('--c-n-l', nL + '%');

            console.log("Farb-Theme wurde dynamisch vom Bild abgeleitet und nach Helligkeit sortiert!");
        };
    }

    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });
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

        const moveHandler = (moveEvent) => {
            handleInteractionMove(moveEvent.touches ? moveEvent.touches[0] : moveEvent);
        };

        const endHandler = (endEvent) => {
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

        // HAPTISCHES FEEDBACK: Beim Einrasten
        if ((cellX !== lastVibratedCell.x || cellY !== lastVibratedCell.y) && navigator.vibrate) {
            navigator.vibrate(5); // Ultra-kurze Vibration
            lastVibratedCell.x = cellX;
            lastVibratedCell.y = cellY;
        }

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

    function rotateFigure90Degrees(matrix) {
        // Transponiert die Matrix und kehrt dann die Spalten um, was zu einer Drehung im Uhrzeigersinn führt.
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).map(row => row.reverse());
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);

        if (!canPlace(figure, placeX, placeY)) return;

        // HAPTISCHES FEEDBACK: Beim Platzieren
        if (navigator.vibrate) {
            navigator.vibrate(40);
        }

        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.category;
        }));

        const points = clearFullLines() + (figure.points || 0);
        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);

        if (score > highscore) {
            highscore = score;
            highscoreElement.textContent = highscore;
            setCookie('highscore', highscore, 365);
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
    function handleKeyPress(e) {
        // Boss-Key "b"
        if (e.key === 'b') {
            const container = document.querySelector('.main-container');
            const footer = document.querySelector('footer'); // NEUE ZEILE
            if (container) {
                container.classList.toggle('boss-key-hidden');
            }
            if (footer) {
                footer.classList.toggle('boss-key-hidden'); // NEUE ZEILE
            }
        }
        // Joker-Key "j"
        if (e.key === 'j') {
            generateJokerFigures();
        }
    }

    // NEUE FUNKTION, um nur Joker-Figuren zu losen
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
        console.log("Aktuelle Zonk-Wahrscheinlichkeit:", currentZonkProbability.toFixed(4));

        const { jokerProbability } = gameConfig;
        let isPlaceableSet = false;
        let newFigures = [];

        // Diese Schleife läuft so lange, bis ein platzierbares Set gefunden wurde
        do {
            newFigures = []; // Set für jeden Versuch zurücksetzen


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

            // Prüfen, ob mindestens eine der drei neuen Figuren passt
            if (newFigures.some(fig => canFigureBePlacedAnywhere(fig))) {
                isPlaceableSet = true;
            }

        } while (!isPlaceableSet);

        // Das gültige Set in die Haupt-Slots übernehmen
        for (let i = 0; i < 3; i++) {
            figuresInSlots[i] = newFigures[i];
            drawFigureInSlot(i);
        }

        // Zonk-Wahrscheinlichkeit für die nächste Runde erhöhen
        const increment = gameConfig.zonkProbabilityIncrementPerRound || 0;
        const max = gameConfig.zonkProbabilityMax || 1;
        currentZonkProbability = Math.min(currentZonkProbability + increment, max);

        drawGameBoard();
        if (isGameOver()) {
            handleGameOver();
        }
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
        for (let i = 0; i < 4; i++) { // Alle 4 Rotationen prüfen
            for (let y = 0; y <= GRID_SIZE - currentForm.length; y++) {
                for (let x = 0; x <= GRID_SIZE - currentForm[0].length; x++) {
                    if (canPlace({ form: currentForm }, x, y)) {
                        return true; // Sobald ein Platz gefunden wird, abbrechen und 'true' zurückgeben
                    }
                }
            }
            currentForm = rotateFigure90Degrees(currentForm);
        }
        return false; // Kein Platz in keiner Rotation gefunden
    }

    function clearFullLines() {
        let rows = [], cols = [];
        for (let y = 0; y < GRID_SIZE; y++) if (gameBoard[y].every(cell => cell !== 0)) rows.push(y);
        for (let x = 0; x < GRID_SIZE; x++) if (gameBoard.every(row => row[x] !== 0)) cols.push(x);

        // HAPTISCHES FEEDBACK: Beim Abräumen von Reihen
        if ((rows.length > 0 || cols.length > 0) && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]); // Pulsierende Vibration
        }

        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        return Math.pow(rows.length + cols.length, 2) * 100;
    }

    function handleGameOver() {
        gameBoardElement.classList.add('crumble');

        let isNewHighscore = score > highscore;
        if (isNewHighscore) {
            highscore = score;
            setCookie('highscore', highscore, 365);
        }

        setTimeout(() => {
            const allCells = gameBoardElement.querySelectorAll('.cell.occupied');
            allCells.forEach(cell => {
                cell.className = 'cell';
            });

            gameBoardElement.classList.remove('crumble');

            if (isNewHighscore) {
                highscoreElement.textContent = highscore;
                highscoreElement.classList.add('pulsate');
                setTimeout(initializeGame, 1800);
            } else {
                initializeGame();
            }

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
    initializeGame();
});
