// Last line of defence against a white screen: catches render-time errors anywhere below it and shows a plain
// fallback. It is mounted OUTSIDE every provider (safe-area, react-query, auth), so the fallback deliberately uses
// only react-native primitives and hard-coded colours/fonts, and nothing that could itself be what crashed.
// Note: error boundaries do not catch event-handler or async errors.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface AppErrorBoundaryProps {
  children?: React.ReactNode;
  /** Hook for crash reporting; called after the error is logged. */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

export interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info?.componentStack);
    try {
      this.props.onError?.(error, info);
    } catch (reportError) {
      // A broken reporter must not take the fallback down with it.
      console.error('[AppErrorBoundary] onError handler threw', reportError);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>Please try again. If it keeps happening, restart the app.</Text>
        <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.8} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2BBD6E',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppErrorBoundary;
