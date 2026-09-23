/** Placeholder until the owner builds the screen. See docs/TEAM_PLAN.md. */
export default function Stub({ title, owner, items }: { title: string; owner: 'A' | 'B'; items: string[] }) {
  return (
    <div className="todo">
      <h2>{title} <span className="pill">Owner: {owner}</span></h2>
      <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
