const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "eduquery_academic_super_secret_jwt_key_2026";

// Authenticates JWT from Authorization Bearer header
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. Bearer token missing." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ error: "Invalid token. User account no longer exists." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized. Token invalid or expired." });
  }
};

// Alias for authMiddleware
const verifyToken = authMiddleware;

// Optional auth: populates req.user if a valid token is provided, otherwise continues as guest
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select("-passwordHash");
      if (user) {
        req.user = user;
      }
    }
  } catch (err) {
    // Silently continue for guest access
  }
  next();
};

// Strict Role-Based Access Control
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required to access this resource." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to [${roles.join(", ")}]. Current role '${req.user.role}' is unauthorized.`,
      });
    }
    next();
  };
};

module.exports = {
  JWT_SECRET,
  authMiddleware,
  verifyToken,
  optionalAuth,
  requireRole,
};
