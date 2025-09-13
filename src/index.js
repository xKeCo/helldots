import CommentOverlay from './overlay.js';

/**
 * Creates and initializes a new CommentOverlay instance
 * @param {Object} options - Configuration options
 * @param {string} [options.shortcutKey='c'] - Key to use for the comment shortcut
 * @param {string} [options.shortcutModifier='alt'] - Modifier key to use ('alt', 'ctrl', or 'shift')
 * @param {boolean} [options.autoInit=true] - Automatically initialize when DOM is ready
 * @returns {CommentOverlay} The comment overlay instance
 */
export function createCommentOverlay(options = {}) {
    const { autoInit = true, ...otherOptions } = options;
    
    const initialize = () => {
        const overlay = new CommentOverlay(otherOptions);
        return overlay;
    };
    
    if (autoInit) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
        } else {
            return initialize();
        }
    }
    
    return initialize;
}

// Export the class for advanced usage
export { CommentOverlay };

// Export a default instance creator for simple usage
export default createCommentOverlay; 