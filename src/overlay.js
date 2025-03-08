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
            <div class="toolbar-content">
                <span class="toolbar-text">Comment</span>
                <span class="shortcut-hint">⌥ + C</span>
            </div>
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
        this.toolbarContent = this.toolbar.querySelector('.toolbar-content');
        this.submitButton = document.getElementById("submit-comment");
        this.cancelButton = document.getElementById("cancel-comment");
        this.commentInput = document.getElementById("comment-input");

        // Event listeners - using bind to ensure 'this' context is preserved
        this.toolbarContent.addEventListener("click", this.toggleCommentMode.bind(this));
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
    }
    
    setupKeyboardShortcut() {
        // Remove any existing event listeners
        if (this.keydownHandler) {
            document.removeEventListener("keydown", this.keydownHandler);
        }
        
        // Create a new handler with proper binding
        this.keydownHandler = (e) => {
            // Check if Alt+C is pressed (Option+C on Mac)
            if (e.altKey && (e.key === 'ç' || e.key === 'Ç')) {
                e.preventDefault(); // Prevent default browser behavior
                e.stopPropagation(); // Stop event propagation
                
                // Toggle comment mode
                this.toggleCommentMode();
                
                // Flash the button to provide visual feedback
                this.flashButton();
                
                return false;
            }
        };
        
        // Add the event listener
        document.addEventListener("keydown", this.keydownHandler);
    }
    
    flashButton() {
        // Add a flash class to the button
        this.toolbarContent.classList.add("flash");
        
        // Remove it after animation completes
        setTimeout(() => {
            this.toolbarContent.classList.remove("flash");
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
        
        this.showCommentBox(x, y);
    }

    toggleCommentMode() {
        this.commentMode = !this.commentMode;
        
        if (this.commentMode) {
            this.toolbarContent.classList.add("active");
            document.body.classList.add("comment-cursor");
        } else {
            this.toolbarContent.classList.remove("active");
            document.body.classList.remove("comment-cursor");
            this.hideCommentBox();
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
        
        // Turn off comment mode after saving a comment
        this.toggleCommentMode();
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
            }, 250);
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
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(8px);
                padding: 8px 12px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 9998;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .toolbar-content {
                display: flex;
                align-items: center;
                gap: 8px;
                color: white;
                cursor: pointer;
                padding: 4px;
                border-radius: 6px;
                transition: background-color 0.2s;
            }
            
            .toolbar-content:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .toolbar-content.active {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .toolbar-text {
                font-size: 14px;
                font-weight: 500;
            }
            
            .shortcut-hint {
                color: #ffffff;
                font-size: 12px;
                background: rgba(255, 255, 255, 0.2);
                padding: 2px 6px;
                border-radius: 4px;
                white-space: nowrap;
            }
            
            #toggle-comment-mode {
                display: none;
            }
            
            #comment-box {
                position: absolute;
                background: #1C1C1E;
                border-radius: 12px;
                box-shadow: 0 3px 15px rgba(0,0,0,0.3);
                padding: 12px;
                z-index: 9999;
                width: 300px;
            }
            
            #comment-input {
                width: 100%;
                min-height: 40px;
                background: #2C2C2E;
                border: none;
                border-radius: 8px;
                padding: 12px;
                resize: none;
                margin-bottom: 10px;
                font-family: inherit;
                color: white;
                font-size: 14px;
            }

            #comment-input::placeholder {
                color: rgba(255, 255, 255, 0.6);
            }
            
            #comment-input:focus {
                outline: none;
                box-shadow: 0 0 0 2px rgba(46, 144, 250, 0.5);
            }
            
            .comment-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            
            .comment-actions button {
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
            }
            
            #submit-comment {
                background: #2E90FA;
                color: white;
            }

            #submit-comment:hover {
                background: #1570D6;
            }
            
            #cancel-comment {
                background: #3A3A3C;
                color: white;
            }

            #cancel-comment:hover {
                background: #2C2C2E;
            }
            
            .comment-circle {
                position: absolute;
                width: 28px;
                height: 28px;
                background: #2E90FA;
                border-radius: 0% 100% 100% 100%;
                border: 2px solid #FFF;
                cursor: pointer;
                z-index: 9997;
                box-shadow: 0 1px 5px rgba(0,0,0,0.2);
                transform: translate(-50%, -50%);
                transition: transform 0.2s, background 0.2s;
                pointer-events: auto;
            }
            
            .comment-circle:hover {
                transform: translate(-50%, -50%) scale(1.2);
                background:rgb(0, 123, 255);
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
                cursor: url('data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(%23filter0_d_4_97)"><path d="M6 8C6 6.89543 6.89543 6 8 6H20C27.732 6 34 12.268 34 20V20C34 27.732 27.732 34 20 34V34C12.268 34 6 27.732 6 20V8Z" fill="%232E90FA"/><path d="M8 7H20C27.1797 7 33 12.8203 33 20C33 27.1797 27.1797 33 20 33C12.8203 33 7 27.1797 7 20V8C7 7.44772 7.44772 7 8 7Z" stroke="white" stroke-width="2"/></g><filter id="filter0_d_4_97" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dx="4" dy="4"/><feGaussianBlur stdDeviation="5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.180392 0 0 0 0 0.564706 0 0 0 0 0.980392 0 0 0 0.16 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_97"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_97" result="shape"/></filter></svg>') 20 20, auto !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Export the class to be used as a module
export default CommentOverlay;
