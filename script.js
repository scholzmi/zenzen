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
    let currentThemeIndex = -1; // Für alphabetisches Durchschalten
    let titleTapCount = 0;
    let titleTapTimer = null;
    
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
            imageList.sort(); // Bilderliste alphabetisch sortieren
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
            console.log(`Hintergrund erfolgreich geladen: ${finalImageUrl}`);
            document.body.style.setProperty('--background-image', `url('${finalImageUrl}')`);
            updateThemeFromImage(finalImageUrl);
        };

        img.onerror = () => {
            console.warn(`Hintergrund '${finalImageUrl}' nicht gefunden. Lade Fallback: ${fallbackUrl}`);
            document.body.style.setProperty('--background-image', `url('${fallbackUrl}')`);
            updateThemeFromImage(fallbackUrl);
        };
    }
    
    function checkForSpecialTheme() {
        if (!specialEvents.specials || !Array.isArray(specialEvents.specials)) {
            return null;
        }

        const now = new Date();
        for (const special of specialEvents.specials) {
            const startDate = new Date(special.startDate);
            const endDate = new Date(special.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            if (now >= startDate && now <= endDate) {
                console.log(`Aha! Heute ist ein spezielles Datum. Event "${special.name}" ist aktiv.`);
                console.log(`Es wurde dieses Bild ausgewählt: ${special.background}`);
                return special.background;
            }
        }
        return null;
    }

    function applyTheme() {
        const specialThemeUrl = checkForSpecialTheme();
        if (specialThemeUrl) {
            const specialThemeIndex = imageList.indexOf(specialThemeUrl);
            if (specialThemeIndex !== -1) {
                currentThemeIndex = specialThemeIndex;
            }
            setBackgroundImage(specialThemeUrl);
            console.log("Special Event gefunden!");
            return;
        }

        console.log("Kein spezielles Event heute. Wechsle zum nächsten Bild...");
        if (imageList.length > 0) {
            currentThemeIndex = (currentThemeIndex + 1) % imageList.length; // Zum nächsten Bild im Zyklus
            const nextImage = imageList[currentThemeIndex];
            setBackgroundImage(nextImage);
            console.log(`Neues Theme gesetzt: ${nextImage}`);
        } else {
            setBackgroundImage(null); // Fallback
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
            console.log("Farbpalette nach Helligkeit sortiert:", palette);

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

    let componentOpacity = 0.05;
    const gameWrapper = document.querySelector('.game-wrapper');

    function updateOpacity(newOpacity) {
        componentOpacity = Math.max(0.00, Math.min(1.0, newOpacity));
        document.documentElement.style.setProperty('--component-bg-a', componentOpacity);
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
            }, 200); // Hold time: 200ms
        }

        boardTapTimer = setTimeout(() => {
             if (boardTapCount === 5) {
                e.preventDefault();
                applyTheme();
            }
            boardTapCount = 0;
        }, 300); // Multi-tap window: 300ms
    }

    function handleBoardTouchMove(e) {
        if (isAdjustingOpacity) {
            e.preventDefault();
            const deltaY = startY - e.touches[0].clientY;
            const newOpacity = startOpacity + (deltaY / 400); // Sensitivity
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
            }, 1500); // 5 Taps within 1.5 seconds
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
            }, 2000); // Muss mit der Dauer der CSS-Animation übereinstimmen
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
            applyTheme();
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
        console.log("Aktuelle Zonk-Wahrscheinlichkeit:", currentZonkProbability.toFixed(4));
        const { jokerProbability } = gameConfig;
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

        const linesCleared = rows.length > 0 || cols.length > 0;
        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        
        return {
            points: Math.pow(rows.length + cols.length, 2) * 100,
            linesCleared: linesCleared
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

    async function startGame() {
        await loadResources();
        applyTheme(); // Wendet initial das erste Theme (oder ein Event-Theme) an
        initializeGame();
    }

    startGame();
});