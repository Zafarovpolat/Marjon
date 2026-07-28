import React from "react";

/**
 * Ловит ошибки рендера в поддереве и показывает fallback вместо белого экрана.
 * Без него любое необработанное исключение в компоненте роняло всё приложение.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 20, margin: 0 }}>Что-то пошло не так</h1>
          <p style={{ color: "#64748b", maxWidth: 420, margin: 0 }}>
            Произошла ошибка в интерфейсе. Попробуйте перезагрузить страницу.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
