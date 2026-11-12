// Logic-level tests for AppErrorBoundary (no renderer in this jest setup): the static state derivation, the
// logging/onError contract, and the reset. react-native is mocked with plain string components.

jest.mock('react-native', () => ({
  StyleSheet: { create: (s: unknown) => s },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
}));

import { AppErrorBoundary } from '../AppErrorBoundary';
import DefaultExport from '../AppErrorBoundary';

describe('AppErrorBoundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is exported both as default and named', () => {
    expect(DefaultExport).toBe(AppErrorBoundary);
  });

  it('getDerivedStateFromError flags the error and keeps it', () => {
    const error = new Error('boom');
    expect(AppErrorBoundary.getDerivedStateFromError(error)).toEqual({ hasError: true, error });
  });

  it('renders children until an error is caught, then the fallback', () => {
    const boundary = new AppErrorBoundary({ children: 'child' });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.render()).toBe('child');

    boundary.state = AppErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const fallback = boundary.render() as any;
    expect(fallback).not.toBe('child');
    expect(JSON.stringify(fallback)).toContain('Something went wrong');
    expect(JSON.stringify(fallback)).toContain('Try again');
  });

  it('componentDidCatch logs with console.error and calls onError', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = jest.fn();
    const boundary = new AppErrorBoundary({ onError });
    const error = new Error('boom');
    const info = { componentStack: '\n in Broken' } as any;

    boundary.componentDidCatch(error, info);

    expect(spy).toHaveBeenCalledWith('[AppErrorBoundary]', error, '\n in Broken');
    expect(onError).toHaveBeenCalledWith(error, info);
  });

  it('a throwing onError does not escape componentDidCatch', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const boundary = new AppErrorBoundary({
      onError: () => {
        throw new Error('reporter down');
      },
    });
    expect(() => boundary.componentDidCatch(new Error('boom'), { componentStack: '' } as any)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reset clears the error state so children render again', () => {
    const boundary = new AppErrorBoundary({ children: 'child' });
    // Stand in for React's setState, which is not wired up outside a renderer.
    boundary.setState = ((update: any) => {
      boundary.state = { ...boundary.state, ...update };
    }) as any;
    boundary.state = AppErrorBoundary.getDerivedStateFromError(new Error('boom'));

    boundary.reset();

    expect(boundary.state).toEqual({ hasError: false, error: null });
    expect(boundary.render()).toBe('child');
  });
});
