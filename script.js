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
    const TOUCH_Y_OFFSET = -60; // Offset, um die Vorschau über dem Finger zu zeigen
    let gameConfig = {};
    const GRID_SIZE = 9;

    async function initializeGame() {
        highscoreElement.classList.remove('pulsate');
        gameBoardElement.classList.remove('crumble');
        
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

    async function loadConfiguration() {
        try {
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`Network response was not ok`);
            gameConfig = await response.json();
            if (versionInfoElement) versionInfoElement.textContent = gameConfig.version || "?.??";
            if (lastModificationElement) lastModificationElement.textContent = gameConfig.lastModification || "N/A";
            
            const parseAndStore = (pool) => Array.isArray(pool) ? pool.map(f => ({ ...f, form: parseShape(f.shape) })) : [];
            gameConfig.figures.normalPool = parseAndStore(gameConfig.figures.normal);
            gameConfig.figures.zonkPool = parseAndStore(gameConfig.figures.zonk);
            gameConfig.figures.jokerPool = parseAndStore(gameConfig.figures.joker);
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

    function assignEventListeners() {
        figureSlots.forEach(slot => {
            slot.addEventListener('touchstart', (e) => handleInteractionStart(e.touches[0], e.currentTarget), { passive: false });
            slot.addEventListener('mousedown', (e) => handleInteractionStart(e, e.currentTarget));
        });
    }

    function handleInteractionStart(event, targetSlot) {
        if (selectedFigure) return;
        const slotIndex = parseInt(targetSlot.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) return;

        selectedSlotIndex = slotIndex;
        selectedFigure = JSON.parse(JSON.stringify(figuresInSlots[selectedSlotIndex]));
        targetSlot.classList.add('dragging');
        
        const moveHandler = (e) => handleInteractionMove(e.touches ? e.touches[0] : e);
        const endHandler = (e) => handleInteractionEnd(e.changedTouches ? e.changedTouches[0] : e);

        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        
        handleInteractionMove(event);
    }
    
    function handleInteractionMove(event) {
        if (!selectedFigure) return;
        event.preventDefault();

        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;

        // **KORREKTUR**: Benutze die clientX/clientY des Events, nicht die Position des Spielfelds
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        
        const cellX = Math.floor(xPos / cellSize);
        const cellY = Math.floor(yPos / cellSize);
        
        drawPreview(selectedFigure, cellX, cellY);
    }

    function handleInteractionEnd(event) {
        if (!selectedFigure) return;
        
        // Remove listeners immediately to prevent conflicts
        const moveHandler = (e) => handleInteractionMove(e.touches ? e.touches[0] : e);
        const endHandler = (e) => handleInteractionEnd(e.changedTouches ? e.changedTouches[0] : e);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', endHandler);
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', endHandler);

        const boardRect = gameBoardElement.getBoundingClientRect();
        const cellSize = boardRect.width / GRID_SIZE;
        const xPos = event.clientX - boardRect.left;
        const yPos = event.clientY - boardRect.top + TOUCH_Y_OFFSET;
        const cellX = Math.floor(xPos / cellSize);
        const cellY = Math.floor(yPos / cellSize);

        placeFigure(selectedFigure, cellX, cellY);
        
        document.querySelector('.figure-slot.dragging')?.classList.remove('dragging');
        selectedFigure = null;
        selectedSlotIndex = -1;
        drawGameBoard();
    }
    
    function rotateFigure90Degrees(matrix) {
        return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex])).reverse();
    }

    function placeFigure(figure, centerX, centerY) {
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);

        if (!canPlace(figure, placeX, placeY)) return;

        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) gameBoard[placeY + y][placeX + x] = figure.color;
        }));

        const points = clearFullLines() + figure.form.flat().reduce((a, b) => a + b, 0);
        score += points;
        scoreElement.textContent = score;
        showScoreAnimation(points);

        figuresInSlots[selectedSlotIndex] = null;
        drawFigureInSlot(selectedSlotIndex);
        
        if (figuresInSlots.every(f => f === null)) {
            generateNewFigures();
        }

        if (isGameOver()) {
            handleGameOver();
        }
    }

    function generateNewFigures() {
        const { zonkProbability, jokerProbability } = gameConfig;
        for (let i = 0; i < 3; i++) {
            let pool, category;
            const rand = Math.random();
            if (rand < zonkProbability) { pool = gameConfig.figures.zonkPool; category = 'zonk'; }
            else if (rand < zonkProbability + jokerProbability) { pool = gameConfig.figures.jokerPool; category = 'joker'; }
            else { pool = gameConfig.figures.normalPool; category = 'normal'; }
            
            let figure = { ...pool[Math.floor(Math.random() * pool.length)] };
            figure.category = category;
            figure.color = gameConfig.figurePalettes[category].placed;

            const rotations = Math.floor(Math.random() * 4);
            for (let r = 0; r < rotations; r++) {
                figure.form = rotateFigure90Degrees(figure.form);
            }
            figuresInSlots[i] = figure;
            drawFigureInSlot(i);
        }
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
            for (let y = 0; y <= GRID_SIZE - figure.form.length; y++) {
                for (let x = 0; x <= GRID_SIZE - figure.form[0].length; x++) {
                    if (canPlace(figure, x, y)) return false;
                }
            }
            return true;
        });
    }

    function clearFullLines() {
        let rows = [], cols = [];
        for (let y = 0; y < GRID_SIZE; y++) if (gameBoard[y].every(cell => cell !== 0)) rows.push(y);
        for (let x = 0; x < GRID_SIZE; x++) if (gameBoard.every(row => row[x] !== 0)) cols.push(x);
        
        rows.forEach(y => gameBoard[y].fill(0));
        cols.forEach(x => gameBoard.forEach(row => row[x] = 0));
        return Math.pow(rows.length + cols.length, 2) * 10;
    }

    function handleGameOver() {
        gameBoardElement.classList.add('crumble');
        
        let isNewHighscore = score > highscore;
        if (isNewHighscore) {
            highscore = score;
            setCookie('highscore', highscore, 365);
        }

        setTimeout(() => {
            if (isNewHighscore) {
                highscoreElement.textContent = highscore;
                highscoreElement.classList.add('pulsate');
                setTimeout(initializeGame, 1800);
            } else {
                initializeGame();
            }
        }, 1000);
    }

    function drawGameBoard() {
        gameBoard.forEach((row, y) => row.forEach((content, x) => {
            const cell = gameBoardElement.children[y * GRID_SIZE + x];
            cell.className = 'cell';
            if (content !== 0) {
                cell.classList.add('occupied');
                cell.style.backgroundColor = content;
            } else {
                cell.style.backgroundColor = '';
            }
        }));
    }

    function drawPreview(figure, centerX, centerY) {
        drawGameBoard();
        const placeX = centerX - Math.floor(figure.form[0].length / 2);
        const placeY = centerY - Math.floor(figure.form.length / 2);
        const canBePlaced = canPlace(figure, placeX, placeY);
        const color = canBePlaced ? figure.color + '80' : 'rgba(255, 77, 77, 0.5)';
        
        figure.form.forEach((row, y) => row.forEach((block, x) => {
            if (block === 1) {
                const boardY = placeY + y, boardX = placeX + x;
                if (boardY >= 0 && boardY < GRID_SIZE && boardX >= 0 && boardX < GRID_SIZE) {
                    if(gameBoard[boardY][boardX] === 0) { // Nur auf leere Zellen zeichnen
                        gameBoardElement.children[boardY * GRID_SIZE + boardX].style.backgroundColor = color;
                    }
                }
            }
        }));
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
                    blockDiv.classList.add('figure-block');
                    blockDiv.style.backgroundColor = figure.color;
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
    initializeGame();
});