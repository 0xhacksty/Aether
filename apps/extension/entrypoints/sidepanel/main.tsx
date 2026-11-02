import React from 'react';
import { createRoot } from 'react-dom/client';
import { BridgeMessageSchema, BridgeStatusSchema, type BridgeStatus } from '@aether/shared';
import './style.css';

function SidePanel() {
  const [state, setState] = React.useState<BridgeStatus['state']>('disconnected');
  const [events, setEvents] = React.useState<BridgeStatus[]>([]);
  const [tabTitle, setTabTitle] = React.useState('No active tab');

  React.useEffect(() => {
    void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
      const title = tabs[0]?.title;
      if (title) setTabTitle(title);
    });
    const listener = (raw: unknown) => {
      const parsed = BridgeMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const status = BridgeStatusSchema.safeParse(parsed.data);
      if (!status.success) return;
      setState(status.data.state);
      setEvents((current) => [status.data, ...current].slice(0, 8));
    };
    chrome.runtime.onMessage.addListener(listener);
    void chrome.runtime.sendMessage({ type: 'aether.getStatus' }).then((response: unknown) => {
      if (!response || typeof response !== 'object' || !('status' in response) || !('recent' in response)) return;
      const current = BridgeStatusSchema.safeParse(response.status);
      if (current.success) setState(current.data.state);
      if (Array.isArray(response.recent)) {
        setEvents(response.recent.map((item: unknown) => BridgeStatusSchema.safeParse(item))
          .filter((item) => item.success)
          .map((item) => item.data));
      }
    }).catch(() => undefined);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const stateLabel = state === 'connected' ? 'Connected' : state === 'step' ? 'Agent active' : 'Disconnected';
  return <main className="panel-shell">
    <header className="topbar">
      <div className="brand-mark" aria-hidden="true"><span /></div>
      <div><p className="eyebrow">AETHER / BROWSER ENGINE</p><h1>Activity</h1></div>
      <span className={`connection-dot ${state}`} title={stateLabel} aria-hidden="true" />
    </header>

    <section className="session-block" aria-label="Current browser tab">
      <div className="section-label"><span>ACTIVE TAB</span><span className="live-label">LIVE</span></div>
      <h2>{tabTitle}</h2>
      <p>{stateLabel}</p>
    </section>

    <section className="activity-section" aria-label="Recent agent activity">
      <div className="section-label"><span>RECENT STEPS</span><span>{String(events.length).padStart(2, '0')}</span></div>
      {events.length === 0 ? <div className="empty-state">
        <div className="empty-glyph" aria-hidden="true">···</div>
        <h2>Standing by</h2>
        <p>When your MCP agent acts in this tab, its latest step will appear here.</p>
      </div> : <ol className="timeline">
        {events.map((event, index) => <li className={index === 0 ? 'current' : ''} key={`${event.timestamp}-${event.label}`}>
          <span className="timeline-marker" aria-hidden="true" />
          <div><p>{event.label}</p><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
        </li>)}
      </ol>}
    </section>

    <footer><span className="footer-line" /><span>CONTROL STAYS WITH YOU</span><span className="footer-line" /></footer>
  </main>;
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Side panel root element is missing');
createRoot(rootElement).render(<SidePanel />);
