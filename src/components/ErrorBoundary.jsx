import { Component } from 'react'
import { Button, Card } from './ui'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo?.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-[var(--error)]/30 bg-[color-mix(in_srgb,var(--error)_8%,transparent)]">
          <h2 className="text-lg font-semibold text-[var(--on-surface)]">Something went wrong</h2>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            This section hit an unexpected error. You can try again or refresh the page.
          </p>
          {import.meta.env.DEV && this.state.error?.message ? (
            <pre className="mt-4 max-h-40 overflow-auto rounded-2xl bg-[var(--surface-low)] p-3 text-xs text-[var(--error)]">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="mt-4">
            <Button type="button" onClick={this.handleReset}>
              Try again
            </Button>
          </div>
        </Card>
      )
    }

    return this.props.children
  }
}
