/**
 * The copyright line, written once.
 *
 * It is rendered per shell rather than nailed to the body under `children`,
 * because the three shells do not share a bottom. The signed-in app is a grid
 * of a sticky full-height sidebar beside a scrolling column, so a footer placed
 * after it would land in the sidebar's grid track and be painted over; it
 * belongs at the end of the column that scrolls. The auth and setup screens
 * centre a card in the viewport, and that centring is what a second child of
 * their grid would quietly undo. Each takes the same component instead, so the
 * wording still has one home.
 *
 * The year is deliberately literal. A copyright notice is a claim about a
 * document rather than about today, and one that silently follows the clock is
 * a fact nobody has checked — so it changes when someone decides it should.
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <small>© 2026 Momentum Studies. All rights reserved.</small>
    </footer>
  );
}
