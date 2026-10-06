// One lane each way: a dashed centerline.
float laneMarks(float u, float t, float px, float tPx) {
  return line(u, px) * dashed(t, tPx);
}
