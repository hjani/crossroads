// Two lanes each way: a solid centerline, and a dashed divider on each side.

// Every lane's width, in meters, line center to line center.
uniform float laneWidth;

float laneMarks(float u, float t, float px, float tPx) {
  float divider = line(abs(u) - laneWidth, px) * dashed(t, tPx);
  return max(line(u, px), divider);
}
