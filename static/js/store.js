// Frontend State Engine (Zustand Replica)
// Replicates useDiagnosticStore from the React design specification.

class DiagnosticStore {
    constructor() {
        this.state = {
            currentResult: null,
            heatmapOpacity: 0.6,
            isUploading: false
        };
        this.listeners = new Set();
    }

    // Get current state values
    getState() {
        return this.state;
    }

    // Add state change listeners
    subscribe(listener) {
        this.listeners.add(listener);
        // Return unsubscribe function
        return () => this.listeners.delete(listener);
    }

    // Notify all active listeners
    _notify() {
        const currentState = { ...this.state };
        this.listeners.forEach(listener => listener(currentState));
    }

    // State modifiers (setters)
    setResult(result) {
        this.state.currentResult = result;
        this._notify();
    }

    setOpacity(opacity) {
        this.state.heatmapOpacity = opacity;
        this._notify();
    }

    setUploading(status) {
        this.state.isUploading = status;
        this._notify();
    }

    resetStore() {
        this.state.currentResult = null;
        this.state.isUploading = false;
        this._notify();
    }
}

// Global store instance
export const useDiagnosticStore = new DiagnosticStore();
