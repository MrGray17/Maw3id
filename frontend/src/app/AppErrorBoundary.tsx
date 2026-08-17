import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', { error, componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error" role="alert">
          <div className="fatal-error__card">
            <span className="brand-mark" aria-hidden="true">+</span>
            <h1>Nous n’avons pas pu afficher Maw3id</h1>
            <p>Actualisez la page. Si le problème persiste, réessayez dans quelques minutes.</p>
            <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
              Actualiser
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
