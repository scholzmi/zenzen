document.addEventListener('DOMContentLoaded', () => {
    // === DOM Elements ===
    const gameBoardElement = document.getElementById('game-board');
    const scoreElement = document.getElementById('score');
    const highscoreElement = document.getElementById('highscore');
    const versionInfoElement = document.getElementById('version-info');
    const lastModificationElement = document.getElementById('last-modification');
    const figureSlots = document.querySelectorAll('.figure-slot');
    const scoreAnimationElement = document.getElementById('score-animation');
    const gameOverContainer = document.getElementById('game-over-container');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverText = document.getElementById('game-over-text');
    const restartBtn = document.getElementById('restart-btn');

    // === Game State ===
    let gameBoard = [], score = 0, highscore = 0;
    let figuresInSlots = [null, null, null];
    let draggedFigure = null;
    let draggedSlotIndex = -1;
    let roundCounter = 0;

    // === Configuration ===
    let gameConfig = {};
    const GRID_SIZE = 9;
    const CELL_SIZE = 40; // in pixels

    // ===================================================================================
    // INITIALIZATION
    // ===================================================================================

    async function initializeGame() {
        gameBoardElement.classList.remove('crumble');
        
        const configLoaded = await loadConfiguration();
        if (!configLoaded) {
            gameBoardElement.innerHTML = '<p style="color:red;text-align:center;padding:20px;">Error: config.json could not be loaded!</p>';
            return;
        }

        applyStylingFromConfig();

        // Check for game version change to reset highscore
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
        roundCounter = 0;
        draggedFigure = null;
        draggedSlotIndex = -1;

        createGameBoard();
        drawGameBoard();
        generateNewFigures();
    }

    async function loadConfiguration() {
        try {
            const response = await fetch('config.json?v=' + new Date().getTime());
            if (!response.ok) throw new Error(`Network response was not ok`);
            gameConfig = await response.json();
            
            if (versionInfoElement) versionInfoElement.textContent = gameConfig.version || "?.??";
            if (lastModificationElement) lastModificationElement.textContent = gameConfig.lastModification || "N/A";

            // Pre-parse all figure shapes
            const parseAndStore = (pool) => Array.isArray(pool) ? pool.map(f => ({ ...f, form: parseShape(f.shape) })) : [];
            gameConfig.figures.normalPool = parseAndStore(gameConfig.figures.normal);
            gameConfig.figures.zonkPool = parseAndStore(gameConfig.figures.zonk);
            gameConfig.figures.jokerPool = parseAndStore(gameConfig.figures.joker);
            
            return true;
        } catch (error) {
            console.error('Error loading configuration:', error);
            if (versionInfoElement) versionInfoElement.textContent = "Config Error!";
            return false;
        }
    }

    function applyStylingFromConfig() {
        const root = document.documentElement;
        root.style.setProperty('--mobileBackgroundColor', gameConfig.mobileBackgroundColor || '#e0f7fa');
        root.style.setProperty('--linePreview', gameConfig.linePreview || 'rgba(84, 160, 255, 0.2)');
        root.style.setProperty('--activeSlotBorder', gameConfig.activeSlotBorder || '#1dd1a1');
        
        // Set title colors
        if(gameConfig.title) {
            Object.keys(gameConfig.title).forEach(key => {
                root.style.setProperty(`--title-${key.replace('_', '-')}`, gameConfig.title[key]);
            });
        }
    }

    function createGameBoard() {
        gameBoardElement.innerHTML = '';
        gameBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.x = x;
                cell.dataset.y = y;
                // For crumble animation delay
                cell.style.setProperty('--delay', `${Math.random() * 1.5}s`);
                gameBoardElement.appendChild(cell);
            }
        }
    }

    // ===================================================================================
    // EVENT LISTENERS
    // ===================================================================================

    function assignEventListeners() {
        restartBtn.addEventListener('click', () => {
            gameOverContainer.classList.add('hidden');
            gameOverContainer.classList.remove('visible');
            initializeGame();
        });

        // Drag and Drop listeners
        figureSlots.forEach(slot => {
            slot.addEventListener('dragstart', handleDragStart);
        });

        gameBoardElement.addEventListener('dragover', handleDragOver);
        gameBoardElement.addEventListener('dragleave', handleDragLeave);
        gameBoardElement.addEventListener('drop', handleDrop);
        gameBoardElement.addEventListener('dragend', handleDragEnd);
    }
    
    // ===================================================================================
    // DRAG & DROP HANDLERS
    // ===================================================================================

    function handleDragStart(e) {
        const slotIndex = parseInt(e.currentTarget.dataset.slotId, 10);
        if (!figuresInSlots[slotIndex]) {
            e.preventDefault();
            return;
        }
        draggedSlotIndex = slotIndex;
        draggedFigure = JSON.parse(JSON.stringify(figuresInSlots[draggedSlotIndex]));
        
        // For a cleaner drag image, we can create a custom one, but for simplicity, we'll let the browser handle it.
        // We add a class to the original element to fade it out.
        setTimeout(() => {
            e.currentTarget.classList.add('dragging');
        }, 0);
    }

    function handleDragOver(e) {
        e.preventDefault(); // This is necessary to allow a drop.
        const targetCell = e.target.closest('.cell');
        if (targetCell && draggedFigure) {
            const x = parseInt(targetCell.dataset.x, 10);
            const y = parseInt(targetCell.dataset.y, 10);
            drawPreview(draggedFigure, x, y);
        }
    }

    function handleDragLeave(e) {
        // When leaving the board, clear the preview
        drawGameBoard();
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetCell = e.target.closest('.cell');
        if (targetCell && draggedFigure) {
            const x = parseInt(targetCell.dataset.x, 10);
            const y = parseInt(targetCell.dataset.y, 10);
            placeFigure(draggedFigure, x, y);
        }
        clearDragState();
    }
    
    function handleDragEnd(e) {
        clearDragState();
    }
    
    function clearDragState() {
        // Clean up visual state
        document.querySelector('.figure-slot.dragging')?.classList.remove('dragging');
        draggedFigure = null;
        draggedSlotIndex = -1;
        drawGameBoard();
    }

    // ===================================================================================
    // GAME LOGIC
    // ===================================================================================

    function placeFigure(figure, centerX, centerY) {
        if (!figure) return;
        const figureHeight = figure.form.length;
        const figureWidth = figure.form[0].length;
        const offsetX = Math.floor(figureWidth / 2);
        const offsetY = Math.floor(figureHeight / 2);
        const placeX = centerX - offsetX;
        const placeY = centerY - offsetY;

        if (!canPlace(figure, placeX, placeY)) return;

        // Place the figure on the board
        figure.form.forEach((row, y) => {
            row.forEach((block, x) => {
                if (block === 1) {
                    gameBoard[placeY + y][placeX + x] = figure.color;
                }
            });
        });

        // Calculate points
        const blockCount = figure.form.flat().reduce((a, b) => a + b, 0);
        let pointMultiplier = 1;
        if (figure.kategorie === 'normal') pointMultiplier = 2;
        else if (figure.kategorie === 'zonk') pointMultiplier = 5;
        const figurePoints = blockCount * pointMultiplier;

        const linePoints = clearFullLines();
        const totalPointsGained = figurePoints + linePoints;
        
        score += totalPointsGained;
        scoreElement.textContent = score;
        showScoreAnimation(totalPointsGained);

        // Clear the used slot
        figuresInSlots[draggedSlotIndex] = null;
        drawFigureInSlot(draggedSlotIndex);
        
        drawGameBoard();

        // Check for new round or game over
        if (figuresInSlots.every(f => f === null)) {
            generateNewFigures();
        }

        if (isGameOver()) {
            setTimeout(() => handleGameOver(), 500);
        }
    }

    function generateNewFigures() {
        roundCounter++;
        const { zonkProbability, jokerProbability } = gameConfig;

        for (let i = 0; i < 3; i++) {
            let randomFigure = null;
            let category = 'normal';
            
            const randomNumber = Math.random();
            if (gameConfig.figures.zonkPool.length > 0 && randomNumber < zonkProbability) {
                randomFigure = gameConfig.figures.zonkPool[Math.floor(Math.random() * gameConfig.figures.zonkPool.length)];
                category = 'zonk';
            } else if (gameConfig.figures.jokerPool.length > 0 && randomNumber < zonkProbability + jokerProbability) {
                randomFigure = gameConfig.figures.jokerPool[Math.floor(Math.random() * gameConfig.figures.jokerPool.length)];
                category = 'joker';
            } else if (gameConfig.figures.normalPool.length > 0) {
                randomFigure = gameConfig.figures.normalPool[Math.floor(Math.random() * gameConfig.figures.normalPool.length)];
                category = 'normal';
            }
            
            if (randomFigure) {
                const baseColor = gameConfig.figurePalettes[category]?.placed || gameConfig.figurePalettes['default'].placed;
                const variedColor = varyColor(baseColor);
                figuresInSlots[i] = { ...randomFigure, id: i, color: variedColor, category: category };
            } else {
                 figuresInSlots[i] = null;
            }
            drawFigureInSlot(i);
        }
        if (isGameOver()) {
            setTimeout(() => handleGameOver(), 100);
        }
    }

    function canPlace(figure, startX, startY) {
        if (!figure || !figure.form) return false;
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
        for (const figure of figuresInSlots) {
            if (figure) {
                // Check if the figure can be placed anywhere on the board
                for (let y = 0; y < GRID_SIZE; y++) {
                    for (let x = 0; x < GRID_SIZE; x++) {
                        if (canPlace(figure, x, y)) {
                            return false; // Found a valid move
                        }
                    }
                }
            }
        }
        return true; // No figure can be placed
    }

    function clearFullLines() {
        let rowsToClear = [], colsToClear = [];
        // Check for full rows
        for (let y = 0; y < GRID_SIZE; y++) {
            if (gameBoard[y].every(cell => cell !== 0)) {
                rowsToClear.push(y);
            }
        }
        // Check for full columns
        for (let x = 0; x < GRID_SIZE; x++) {
            let colFull = true;
            for (let y = 0; y < GRID_SIZE; y++) {
                if (gameBoard[y][x] === 0) {
                    colFull = false;
                    break;
                }
            }
            if (colFull) {
                colsToClear.push(x);
            }
        }
        
        const linesCleared = rowsToClear.length + colsToClear.length;
        if (linesCleared > 0) {
            rowsToClear.forEach(y => gameBoard[y].fill(0));
            colsToClear.forEach(x => gameBoard.forEach(row => row[x] = 0));
        }
        
        // Points for clearing lines: (lines)^3 * 10
        return Math.pow(linesCleared, 3) * 10;
    }

    function handleGameOver() {
        gameBoardElement.classList.add('crumble');
        
        setTimeout(() => {
            if (score > highscore) {
                highscore = score;
                highscoreElement.textContent = highscore;
                setCookie('highscore', highscore, 365);
                gameOverTitle.textContent = 'New Highscore!';
                gameOverText.textContent = `You reached ${highscore} points!`;
            } else {
                gameOverTitle.textContent = 'Game Over!';
                gameOverText.textContent = `Your score: ${score}`;
            }
            gameOverContainer.classList.add('visible');
            gameOverContainer.classList.remove('hidden');
        }, 1500); // Wait for crumble animation
    }

    // ===================================================================================
    // DRAWING & RENDERING
    // ===================================================================================

    function drawGameBoard() {
        gameBoard.forEach((row, y) => {
            row.forEach((content, x) => {
                const cell = gameBoardElement.children[y * GRID_SIZE + x];
                cell.className = 'cell'; // Reset classes
                if (content !== 0) {
                    cell.classList.add('occupied');
                    cell.style.backgroundColor = content;
                } else {
                    cell.style.backgroundColor = '';
                }
            });
        });
    }

    function drawPreview(figure, centerX, centerY) {
        drawGameBoard(); // Redraw the board first to clear old previews

        const figureHeight = figure.form.length;
        const figureWidth = figure.form[0].length;
        const offsetX = Math.floor(figureWidth / 2);
        const offsetY = Math.floor(figureHeight / 2);
        const placeX = centerX - offsetX;
        const placeY = centerY - offsetY;

        const canBePlaced = canPlace(figure, placeX, placeY);
        const previewColor = canBePlaced 
            ? (gameConfig.figurePalettes[figure.category] || gameConfig.figurePalettes['default']).preview 
            : 'rgba(233, 78, 119, 0.5)'; // A standard "invalid" color

        figure.form.forEach((row, y) => {
            row.forEach((block, x) => {
                if (block === 1) {
                    const boardY = placeY + y;
                    const boardX = placeX + x;
                    if (boardY >= 0 && boardY < GRID_SIZE && boardX >= 0 && boardX < GRID_SIZE) {
                        const cell = gameBoardElement.children[boardY * GRID_SIZE + boardX];
                        // Only draw preview on empty cells
                        if (gameBoard[boardY][boardX] === 0) {
                            cell.style.backgroundColor = previewColor;
                        }
                    }
                }
            });
        });
    }
    
    function drawFigureInSlot(index) {
        const slot = figureSlots[index];
        const figure = figuresInSlots[index];
        slot.innerHTML = ''; // Clear previous content
        slot.draggable = figure ? true : false; // Make slot draggable only if it has a figure

        if (figure) {
            const container = document.createElement('div');
            container.classList.add('figure-container');
            const form = figure.form;
            const size = Math.max(form.length, form[0].length);
            const blockSize = size > 4 ? 12 : 20; // Use smaller blocks for large figures
            
            container.style.gridTemplateRows = `repeat(${form.length}, ${blockSize}px)`;
            container.style.gridTemplateColumns = `repeat(${form[0].length}, ${blockSize}px)`;
            
            form.forEach(row => {
                row.forEach(block => {
                    const blockDiv = document.createElement('div');
                    if (block === 1) {
                        blockDiv.classList.add('figure-block');
                        blockDiv.style.backgroundColor = figure.color;
                        blockDiv.style.width = `${blockSize}px`;
                        blockDiv.style.height = `${blockSize}px`;
                    }
                    container.appendChild(blockDiv);
                });
            });
            slot.appendChild(container);
        }
    }

    function showScoreAnimation(value) {
        if (!scoreAnimationElement || value === 0) return;
        scoreAnimationElement.classList.remove('animate');
        void scoreAnimationElement.offsetWidth; // Trigger reflow
        
        scoreAnimationElement.textContent = `+${value}`;
        scoreAnimationElement.style.color = '#34A853';
        
        const boardRect = gameBoardElement.getBoundingClientRect();
        const randX = boardRect.width * 0.2 + Math.random() * boardRect.width * 0.6;
        const randY = boardRect.height * 0.1 + Math.random() * boardRect.height * 0.2;
        scoreAnimationElement.style.left = `${randX}px`;
        scoreAnimationElement.style.top = `${randY}px`;
        
        scoreAnimationElement.classList.add('animate');
    }
    
    // ===================================================================================
    // HELPER FUNCTIONS
    // ===================================================================================

    function parseShape(shapeCoords) {
        if (!shapeCoords || shapeCoords.length === 0) return [[]];
        let tempMatrix = Array.from({ length: 5 }, () => Array(5).fill(0));
        let minRow = 5, maxRow = -1, minCol = 5, maxCol = -1;
        shapeCoords.forEach(coord => {
            const row = Math.floor((coord - 1) / 5);
            const col = (coord - 1) % 5;
            if (row < 5 && col < 5) {
                tempMatrix[row][col] = 1;
                minRow = Math.min(minRow, row);
                maxRow = Math.max(maxRow, row);
                minCol = Math.min(minCol, col);
                maxCol = Math.max(maxCol, col);
            }
        });
        if (maxRow === -1) return [];
        return tempMatrix.slice(minRow, maxRow + 1).map(row => row.slice(minCol, maxCol + 1));
    }

    // A simple function to slightly vary colors for visual appeal
    function varyColor(hex) {
        const amount = Math.floor(Math.random() * 40) - 20; // -20 to +20
        let [r, g, b] = hex.match(/\w\w/g).map(x => parseInt(x, 16));
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        return "#" + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // ===================================================================================
    // START THE GAME
    // ===================================================================================
    assignEventListeners();
    initializeGame();
});