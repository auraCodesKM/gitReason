import "./square-snake.css";

const CELLS = [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2], [1, 2], [2, 2],
];

export function SquareSnake({ size = 40 }) {
  return (
    <div className="square-snake" style={{ width: size, height: size }}>
      {CELLS.map(([x, y], i) => (
        <span key={i} className="square-snake-cell" style={{ animationDelay: `${(x + y) * 0.15}s` }} />
      ))}
    </div>
  );
}
