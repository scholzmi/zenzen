document.addEventListener('DOMContentLoaded', () => {
    const gameBoardElement = document.getElementById('game-board');
    const previewLayerElement = document.getElementById('preview-layer');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');

    let gameBoard = [], score = 0, highscore = 0;
    let figuresInSlots = [null, null, null];
    let selectedFigure = null, selectedSlotIndex = -1;
    const TOUCH_Y_OFFSET = -120;
    let gameConfig = {}, themes = [], currentThemeIndex = 0;
    const GRID_SIZE = 9;
    let isDragging = false, lastTap = 0, tapTimeout = null;
    const doubleTapDelay = 300;

    async function initializeGame() {
        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');
        
        if (themes.length === 0) await loadThemes();
        const configLoaded = await loadConfiguration();
        if (!configLoaded) return;

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

    async function loadThemes() {
        try {
            const response = await fetch('themes/themes.json?v=' + new Date().getTime());
            themes = await response.json();
            const savedThemeIndex = parseInt(getCookie('themeIndex') || '0', 10);
            currentThemeIndex = savedThemeIndex < themes.length ? savedThemeIndex : 0;
            applyTheme();
        } catch (error) {
            console.error("Could not load themes.json:", error);
            themes = [{ name: 'frozen', backgroundImage: 'bg.png' }];
            applyTheme();
        }
    }

    function applyTheme() {
        if (themes.length === 0) return;
        const theme = themes[currentThemeIndex];
        document.body.dataset.theme = theme.name;
        document.body.style.backgroundImage = `url('themes/${theme.backgroundImage}')`;
    }

    function switchToNextTheme() {
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        setCookie('themeIndex', currentThemeIndex, 365);
        applyTheme();
    }
    
    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        previewLayerElement.innerHTML = '';
        gameBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        const cellSize = gameBoardElement.clientWidth / GRID_SIZE;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                gameBoardElement.appendChild(cell);
            }
        }
        document.documentElement.style.setProperty('--figure-block-size', `${Math.max(10, cellSize / 2.5)}px`);
    }

    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('mousedown', (e) => handleTapOrDragStart(e));
            slot.addEventListener('touchstart', (e) => handleTapOrDragStart(e), { passive: false });
        });
        window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'd') switchToNextTheme(); });
        setupShakeDetection();
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
        lastTap = now;
        tapTimeout = setTimeout(() => handleDragStart(e.touches ? e.touches[0] : e, targetSlot), 150);
        const cancel = () => clearTimeout(tapTimeout);
        targetSlot.addEventListener('mouseup', cancel, { once: true });
        targetSlot.addEventListener('touchend', cancel, { once: true });
    }

    function rotateFigureInSlot(slotIndex) {
        if (!figuresInSlots[slotIndex]) return;
        figuresInSlots[slotIndex].form = rotateFigure90Degrees(figuresInSlots[slotIndex].form);
        drawFigureInSlot(slotIndex);
        if (isGameOver()) handleGameOver();
    }

    function handleDragStart(event, targetSlot) {
        if (isDragging) return;
        const slotIndex = parseInt(targetSlot.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) return;
        isDragging = true;
        selectedSlotIndex = slotIndex;
        selectedFigure = JSON.parse(JSON.stringify(figuresInSlots[selectedSlotIndex]));
        targetSlot.classList.add('dragging');
        const move = (e) => handleInteractionMove(e.touches ? e.touches[0] : e);
        const end = (e) => {
            document.removeEventListener('touchmove', move);
            document.removeEventListener('mousemove', move);
            document.removeEventListener('touchend', end);
            document.removeEventListener('mouseup', end);
            handleInteractionEnd(e.changedTouches ? e.changedTouches[0] : e);
        };
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('mousemove', move);
        document.addEventListener('touchend', end);
        document.addEventListener('mouseup', end);
        handleInteractionMove(event);
    }
    
    function handleInteractionMove(event) {
        if (!isDragging) return;
        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.round(xPos / cellSize);
        const cellY = Math.round(yPos / cellSize);
        drawPreview(selectedFigure, cellX, cellY);
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
        previewLayerElement.innerHTML = '';
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        if (!canPlace(figure, placeX, placeY)) return;
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.color;
        }));
        drawGameBoard();
        const points = clearFullLines() + figure.form.flat().reduce((a, b) => a + b, 0);
        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);
        figuresInSlots[selectedSlotIndex] = null;
        drawFigureInSlot(selectedSlotIndex);
        if (figuresInSlots.every(f => f === null)) generateNewFigures();
        if (isGameOver()) handleGameOver();
    }

    // --- Übrige Funktionen (generateNewFigures, canPlace, isGameOver, etc.) bleiben wie in der letzten Antwort ---
    
    function drawPreview(figure, centerX, centerY) {
        previewLayerElement.innerHTML = '';
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        const canBePlaced = canPlace(figure, placeX, placeY);
        const color = canBePlaced ? figure.color + '99' : 'rgba(255, 77, 77, 0.6)';
        
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) {
                const boardY = placeY + y, boardX = placeX + x;
                const previewBlock = document.createElement('div');
                previewBlock.className = 'preview-block';
                previewBlock.style.gridRowStart = boardY + 1;
                previewBlock.style.gridColumnStart = boardX + 1;
                previewBlock.style.backgroundColor = color;
                previewLayerElement.appendChild(previewBlock);
            }
        }));
    }
    
    // ... (alle weiteren Helfer- und Logikfunktionen hier einfügen, sie sind unverändert)
    
    // --- Init ---
    assignEventListeners();
    initializeGame();
});