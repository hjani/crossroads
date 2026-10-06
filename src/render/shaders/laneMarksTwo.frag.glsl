// Two lanes each way: a solid centerline, and a dashed divider on each side.

// Every lane but the curb lane, in meters, line center to line center. The
// curb lane takes the rest of the width.
const float INNER_LANE_WIDTH = 3.0;

float laneMarks(float u, float t, float px, float tPx) {
  float divider = line(abs(u) - INNER_LANE_WIDTH, px) * dashed(t, tPx);
  return max(line(u, px), divider);
}
