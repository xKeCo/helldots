class CommentOverlay {
    constructor() {
        this.comments = [];
        this.commentMode = false;
        this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
        
        // Ensure the DOM is fully loaded before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initOverlay());
        } else {
            this.initOverlay();
        }
    }

    initOverlay() {
        // Create the floating toolbar
        this.toolbar = document.createElement("div");
        this.toolbar.id = "comment-toolbar";
        this.toolbar.innerHTML = `
            <button id="toggle-comment-mode">Comment</button>
            <span class="shortcut-hint">${this.isMac ? '⌥' : 'Alt'}+C</span>
        `;
        document.body.appendChild(this.toolbar);

        // Create the comment input box (initially hidden)
        this.commentBox = document.createElement("div");
        this.commentBox.id = "comment-box";
        this.commentBox.innerHTML = `
            <textarea id="comment-input" placeholder="Type your comment..."></textarea>
            <div class="comment-actions">
                <button id="submit-comment">Save</button>
                <button id="cancel-comment">Cancel</button>
            </div>
        `;
        this.commentBox.style.display = "none";
        document.body.appendChild(this.commentBox);

        // Get references to DOM elements
        this.toggleButton = document.getElementById("toggle-comment-mode");
        this.submitButton = document.getElementById("submit-comment");
        this.cancelButton = document.getElementById("cancel-comment");
        this.commentInput = document.getElementById("comment-input");

        // Event listeners - using bind to ensure 'this' context is preserved
        this.toggleButton.addEventListener("click", this.toggleCommentMode.bind(this));
        this.submitButton.addEventListener("click", this.saveComment.bind(this));
        this.cancelButton.addEventListener("click", this.hideCommentBox.bind(this));
        
        // Add keyboard event for submitting with Enter
        this.commentInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.saveComment();
            }
        });

        // Add keyboard shortcut for toggling comment mode (Alt+C)
        this.setupKeyboardShortcut();

        // Click event for placing comments - using mousedown for better precision
        document.addEventListener("mousedown", this.handleDocumentClick.bind(this));

        // Inject styles
        this.injectStyles();
        
        // Log initialization for debugging
        console.log("CommentOverlay initialized successfully", this);
        console.log(`Keyboard shortcut: ${this.isMac ? 'Option' : 'Alt'}+C to toggle comment mode`);
    }
    
    setupKeyboardShortcut() {
        // Remove any existing event listeners
        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler);
        }
        
        // Create a new handler with proper binding
        this.keydownHandler = (e) => {
            console.log("Key pressed:", e.key, "Alt key:", e.altKey);
            
            // Check if Alt+C is pressed (Option+C on Mac)
            if (e.altKey && (e.key === 'ç' || e.key === 'Ç')) {
                console.log("Shortcut detected: Alt+C");
                e.preventDefault(); // Prevent default browser behavior
                e.stopPropagation(); // Stop event propagation
                
                // Toggle comment mode
                this.toggleCommentMode();
                console.log(`Comment mode toggled with keyboard shortcut (${this.isMac ? 'Option' : 'Alt'}+C)`);
                
                // Flash the button to provide visual feedback
                this.flashButton();
                
                return false;
            }
        };
        
        // Add the event listener
        document.addEventListener("keydown", this.keydownHandler);
        
        // Add a test button to the toolbar for debugging
        const testButton = document.createElement("button");
        testButton.id = "test-shortcut";
        testButton.textContent = "Test Alt+C";
        testButton.style.fontSize = "10px";
        testButton.style.padding = "3px 6px";
        testButton.style.background = "#7f8c8d";
        testButton.addEventListener("click", () => {
            console.log("Simulating Alt+C shortcut");
            this.toggleCommentMode();
            this.flashButton();
        });
        this.toolbar.appendChild(testButton);
    }
    
    flashButton() {
        // Add a flash class to the button
        this.toggleButton.classList.add("flash");
        
        // Remove it after animation completes
        setTimeout(() => {
            this.toggleButton.classList.remove("flash");
        }, 300);
    }
    
    handleDocumentClick(e) {
        // Only proceed if in comment mode and not clicking on the toolbar or comment box
        if (!this.commentMode) return;
        
        // Check if clicking on excluded elements
        if (this.toolbar.contains(e.target) || 
            this.commentBox.contains(e.target) ||
            e.target.closest('.comment-circle') ||
            e.target.closest('.comment-tooltip')) {
            return;
        }
        
        // Prevent default behavior to ensure consistent positioning
        e.preventDefault();
        
        // Get the exact position relative to the document
        const x = e.pageX;
        const y = e.pageY;
        
        console.log("Placing comment at:", x, y);
        this.showCommentBox(x, y);
    }

    toggleCommentMode() {
        this.commentMode = !this.commentMode;
        
        if (this.commentMode) {
            this.toggleButton.classList.add("active");
            document.body.classList.add("comment-cursor");
            console.log("Comment mode activated");
        } else {
            this.toggleButton.classList.remove("active");
            document.body.classList.remove("comment-cursor");
            this.hideCommentBox();
            console.log("Comment mode deactivated");
        }
    }

    showCommentBox(x, y) {
        // Store the position for later saving
        this.currentPosition = { x, y };
        
        // Position and show the comment box
        this.commentBox.style.display = "block";
        
        // Adjust position to prevent the box from going off-screen
        const boxWidth = 250; // Width from CSS
        const boxHeight = 150; // Approximate height
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        
        // Calculate adjusted position to keep box in viewport
        let adjustedX = x;
        let adjustedY = y;
        
        if (x + boxWidth > windowWidth + scrollX) {
            adjustedX = x - boxWidth;
        }
        
        if (y + boxHeight > windowHeight + scrollY) {
            adjustedY = y - boxHeight;
        }
        
        this.commentBox.style.left = `${adjustedX}px`;
        this.commentBox.style.top = `${adjustedY}px`;
        
        // Focus the textarea
        this.commentInput.value = "";
        setTimeout(() => this.commentInput.focus(), 50); // Increased delay to ensure focus works
    }

    hideCommentBox() {
        this.commentBox.style.display = "none";
        this.currentPosition = null;
    }

    saveComment() {
        if (!this.commentInput.value.trim() || !this.currentPosition) return;

        const comment = {
            text: this.commentInput.value,
            x: this.currentPosition.x,
            y: this.currentPosition.y,
            id: Date.now() // Add unique ID for each comment
        };

        this.comments.push(comment);
        this.renderCommentCircle(comment);
        this.hideCommentBox();
        
        console.log("Comment saved at position:", comment.x, comment.y);
        
        // Turn off comment mode after saving a comment
        this.toggleCommentMode();
        console.log("Comment mode automatically turned off after saving");
    }

    renderCommentCircle(comment) {
        const circle = document.createElement("div");
        circle.className = "comment-circle";
        circle.dataset.commentId = comment.id;
        
        // Position exactly at the click point
        circle.style.left = `${comment.x}px`;
        circle.style.top = `${comment.y}px`;
        
        // Create data attributes to store the comment text
        circle.dataset.commentText = comment.text;
        
        // Add hover events to show/hide the comment tooltip
        circle.addEventListener("mouseenter", (e) => {
            this.showCommentTooltip(circle, comment);
        });
        
        circle.addEventListener("mouseleave", (e) => {
            // Add a small delay to allow moving cursor to tooltip
            setTimeout(() => {
                const tooltip = document.querySelector(`.comment-tooltip[data-for="${comment.id}"]`);
                if (tooltip && !tooltip.matches(':hover')) {
                    tooltip.remove();
                }
            }, 300);
        });
        
        // Keep click event for mobile devices
        circle.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showCommentTooltip(circle, comment);
        });
        
        document.body.appendChild(circle);
    }

    showCommentTooltip(circle, comment) {
        // Remove any existing tooltips for this comment
        const existingTooltip = document.querySelector(`.comment-tooltip[data-for="${comment.id}"]`);
        if (existingTooltip) return; // Don't create duplicate tooltips
        
        // Create a tooltip
        const tooltip = document.createElement("div");
        tooltip.className = "comment-tooltip";
        tooltip.textContent = comment.text;
        tooltip.dataset.for = comment.id; // Link tooltip to comment
        
        // Add to the DOM first (invisible) so we can measure its dimensions
        tooltip.style.visibility = 'hidden';
        document.body.appendChild(tooltip);
        
        // Get dimensions after adding to DOM
        const tooltipRect = tooltip.getBoundingClientRect();
        const circleRect = circle.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        // Calculate the best position for the tooltip
        let tooltipX, tooltipY;
        
        // Horizontal positioning - try right side first, then left if no space
        if (circleRect.right + tooltipRect.width + 15 <= viewportWidth) {
            // Position to the right of the circle
            tooltipX = circleRect.right + scrollX + 15;
        } else if (circleRect.left - tooltipRect.width - 15 >= 0) {
            // Position to the left of the circle
            tooltipX = circleRect.left + scrollX - tooltipRect.width - 15;
        } else {
            // Center horizontally if neither side has enough space
            tooltipX = Math.max(10, Math.min(
                scrollX + viewportWidth - tooltipRect.width - 10,
                scrollX + (viewportWidth - tooltipRect.width) / 2
            ));
        }
        
        // Vertical positioning - try to center with the circle
        tooltipY = circleRect.top + scrollY + (circleRect.height / 2) - (tooltipRect.height / 2);
        
        // Ensure tooltip stays within vertical bounds
        if (tooltipY < scrollY + 10) {
            tooltipY = scrollY + 10;
        } else if (tooltipY + tooltipRect.height > scrollY + viewportHeight - 10) {
            tooltipY = scrollY + viewportHeight - tooltipRect.height - 10;
        }
        
        // Apply the calculated position
        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;
        tooltip.style.visibility = 'visible';
        
        // Add close button
        const closeButton = document.createElement("span");
        closeButton.className = "close-tooltip";
        closeButton.innerHTML = "×";
        closeButton.addEventListener("click", (e) => {
            e.stopPropagation();
            tooltip.remove();
        });
        tooltip.appendChild(closeButton);
        
        // Add hover behavior to tooltip itself
        tooltip.addEventListener("mouseleave", () => {
            tooltip.remove();
        });
        
        // Add a small arrow pointing to the circle
        const arrow = document.createElement("div");
        arrow.className = "tooltip-arrow";
        
        // Position the arrow based on tooltip placement
        if (tooltipX > circleRect.right + scrollX) {
            // Tooltip is to the right
            arrow.classList.add("arrow-left");
            arrow.style.left = "-8px";
            arrow.style.top = `${(tooltipRect.height / 2) - 8}px`;
        } else if (tooltipX + tooltipRect.width < circleRect.left + scrollX) {
            // Tooltip is to the left
            arrow.classList.add("arrow-right");
            arrow.style.right = "-8px";
            arrow.style.top = `${(tooltipRect.height / 2) - 8}px`;
        } else if (tooltipY > circleRect.bottom + scrollY) {
            // Tooltip is below
            arrow.classList.add("arrow-top");
            arrow.style.top = "-8px";
            arrow.style.left = `${Math.min(tooltipRect.width - 16, Math.max(8, circleRect.left + (circleRect.width / 2) - tooltipX))}px`;
        } else {
            // Tooltip is above
            arrow.classList.add("arrow-bottom");
            arrow.style.bottom = "-8px";
            arrow.style.left = `${Math.min(tooltipRect.width - 16, Math.max(8, circleRect.left + (circleRect.width / 2) - tooltipX))}px`;
        }
        
        tooltip.appendChild(arrow);
    }

    injectStyles() {
        // Remove any existing styles to prevent duplication
        const existingStyle = document.getElementById('comment-overlay-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        const style = document.createElement("style");
        style.id = 'comment-overlay-styles';
        style.textContent = `
            #comment-toolbar {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #2c3e50;
                padding: 10px;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 9998;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            #toggle-comment-mode {
                background: #3498db;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                transition: background 0.3s;
            }
            
            #toggle-comment-mode:hover {
                background: #2980b9;
            }
            
            #toggle-comment-mode.active {
                background: #e74c3c;
            }
            
            #toggle-comment-mode.flash {
                animation: button-flash 0.3s ease;
            }
            
            @keyframes button-flash {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); background: #f39c12; }
                100% { transform: scale(1); }
            }
            
            .shortcut-hint {
                color: #ecf0f1;
                font-size: 12px;
                background: rgba(0,0,0,0.2);
                padding: 3px 6px;
                border-radius: 3px;
                white-space: nowrap;
            }
            
            #comment-box {
                position: absolute;
                background: white;
                border-radius: 5px;
                box-shadow: 0 3px 15px rgba(0,0,0,0.2);
                padding: 10px;
                z-index: 9999;
                width: 250px;
            }
            
            #comment-input {
                width: 100%;
                height: 80px;
                border: 1px solid #ddd;
                border-radius: 4px;p
                padding: 8px;
                resize: none;
                margin-bottom: 10px;
                font-family: inherit;
            }
            
            .comment-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            
            .comment-actions button {
                padding: 5px 12px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
            }
            
            #submit-comment {
                background: #2ecc71;
                color: white;
            }
            
            #cancel-comment {
                background: #ecf0f1;
                color: #34495e;
            }
            
            .comment-circle {
                position: absolute;
                width: 16px;
                height: 16px;
                background: #f39c12;
                border-radius: 50%;
                cursor: pointer;
                z-index: 9997;
                box-shadow: 0 1px 5px rgba(0,0,0,0.2);
                transform: translate(-50%, -50%);
                transition: transform 0.2s, background 0.2s;
                pointer-events: auto;
            }
            
            .comment-circle:hover {
                transform: translate(-50%, -50%) scale(1.2);
                background: #e67e22;
            }
            
            .comment-tooltip {
                position: absolute;
                background: white;
                border-radius: 5px;
                padding: 10px;
                box-shadow: 0 2px 15px rgba(0,0,0,0.2);
                max-width: 250px;
                z-index: 10000;
                white-space: pre-wrap;
                line-height: 1.4;
            }
            
            .tooltip-arrow {
                position: absolute;
                width: 0;
                height: 0;
                border: 8px solid transparent;
            }
            
            .arrow-left {
                border-right-color: white;
            }
            
            .arrow-right {
                border-left-color: white;
            }
            
            .arrow-top {
                border-bottom-color: white;
            }
            
            .arrow-bottom {
                border-top-color: white;
            }
            
            .close-tooltip {
                position: absolute;
                top: 2px;
                right: 6px;
                font-size: 16px;
                cursor: pointer;
                color: #95a5a6;
            }
            
            .close-tooltip:hover {
                color: #e74c3c;
            }
            
            .comment-cursor {
                cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%23f39c12" stroke="%23000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>') 12 12, auto !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Export the class to be used as a module
export default CommentOverlay;
