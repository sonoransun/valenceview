/* Valence View — VV.M: minimal column-major mat4/vec3 math.
 * All mat4s are Float32Array(16), column-major (element [col*4+row]) so they
 * feed gl.uniformMatrix4fv directly. Callers supply `out`; no allocation in
 * hot paths. No quaternions, no general inverse (view built via lookAt). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const M = {};

  M.m4ident = function (out) {
    for (let i = 0; i < 16; i++) out[i] = 0;
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  };

  // out = a * b (column vectors: applies b first). Aliasing-safe.
  M.m4mul = function (out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
  };

  M.m4persp = function (out, fovYrad, aspect, near, far) {
    const f = 1 / Math.tan(fovYrad / 2);
    for (let i = 0; i < 16; i++) out[i] = 0;
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  };

  M.m4lookAt = function (out, eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-9) { xx = 1; xy = 0; xz = 0; xl = 1; } // eye axis parallel to up
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  };

  // Rodrigues rotation about axis3 (need not be normalized).
  M.m4rotAxis = function (out, axis3, rad) {
    let x = axis3[0], y = axis3[1], z = axis3[2];
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
    out[0] = x * x * t + c; out[1] = y * x * t + z * s; out[2] = z * x * t - y * s; out[3] = 0;
    out[4] = x * y * t - z * s; out[5] = y * y * t + c; out[6] = z * y * t + x * s; out[7] = 0;
    out[8] = x * z * t + y * s; out[9] = y * z * t - x * s; out[10] = z * z * t + c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  };

  M.m4fromTranslation = function (out, v3) {
    M.m4ident(out);
    out[12] = v3[0]; out[13] = v3[1]; out[14] = v3[2];
    return out;
  };

  // Transforms p3 by m, divides by w — used for label projection.
  M.m4transformPoint = function (out3, m, p3) {
    const x = p3[0], y = p3[1], z = p3[2];
    let w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w === 0) w = 1e-12;
    out3[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out3[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out3[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out3;
  };

  // Upper-left 3x3; valid normal matrix here (rotation + uniform scale only).
  M.m3fromM4 = function (out9, m16) {
    out9[0] = m16[0]; out9[1] = m16[1]; out9[2] = m16[2];
    out9[3] = m16[4]; out9[4] = m16[5]; out9[5] = m16[6];
    out9[6] = m16[8]; out9[7] = m16[9]; out9[8] = m16[10];
    return out9;
  };

  M.v3set = function (out, x, y, z) { out[0] = x; out[1] = y; out[2] = z; return out; };
  M.v3add = function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; };
  M.v3sub = function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  M.v3scale = function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; };
  M.v3dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  M.v3cross = function (o, a, b) {
    const x = a[1] * b[2] - a[2] * b[1];
    const y = a[2] * b[0] - a[0] * b[2];
    const z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z;
    return o;
  };
  M.v3len = function (a) { return Math.hypot(a[0], a[1], a[2]); };
  M.v3norm = function (o, a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l;
    return o;
  };
  M.v3lerp = function (o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  };

  VV.M = M;
})();
