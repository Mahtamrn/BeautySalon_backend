const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "http://localhost:5174",
    methods: "GET, POST, PUT, DELETE",
    credentials: true,
  })
);

const { neon } = require("@neondatabase/serverless");
const port = 5000;
const sql = neon(process.env.DATABASE_URL);

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }
  next();
};

const hashPassword = (password) => {
  return crypto.createHash("sha256").update(password).digest("hex");
};

app.post("/users/register", async (req, res) => {
  const { name, email, password, is_admin = false } = req.body;
  const hashedPassword = hashPassword(password);
  try {
    await sql`INSERT INTO users (name, email, password, is_admin) VALUES (${name}, ${email}, ${hashedPassword}, ${is_admin})`;
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/users/login", async (req, res) => {
  console.log("Request body:", req.body);
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const hashedPassword = hashPassword(password);
    const user = await sql`SELECT * FROM users WHERE email = ${email}`;

    if (user.length === 0 || user[0].password !== hashedPassword) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user[0].is_blocked) {
      return res
        .status(403)
        .json({ message: "Your account has been blocked." });
    }

    const token = generateToken(user[0]);
    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Error logging in" });
  }
});

app.get("/users", authMiddleware, async (_, res) => {
  try {
    const users = await sql`SELECT id, name, email, is_admin FROM users`;
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get("/services", async (_, res) => {
  try {
    const services = await sql`SELECT * FROM services`;
    res.json(services);
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ message: "Error fetching services" });
  }
});

app.post("/services", authMiddleware, adminMiddleware, async (req, res) => {
  const { name, description, price, duration } = req.body;
  try {
    await sql`INSERT INTO services (name, description, price, duration) VALUES (${name}, ${description}, ${price}, ${duration})`;
    res.status(201).json({ message: "Service added successfully" });
  } catch (error) {
    console.error("Error adding service:", error);
    res.status(500).json({ message: "Error adding service" });
  }
});

app.put("/services/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, price, duration } = req.body;
  try {
    await sql`
          UPDATE services 
          SET name = ${name}, description = ${description}, price = ${price}, duration = ${duration}
          WHERE id = ${id}
      `;
    res.json({ message: "Service updated successfully" });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ message: "Error updating service" });
  }
});

app.put("/services/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, price, duration } = req.body;
  try {
    await sql`
          UPDATE services 
          SET name = ${name}, description = ${description}, price = ${price}, duration = ${duration}
          WHERE id = ${id}
      `;
    res.json({ message: "Service updated successfully" });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ message: "Error updating service" });
  }
});

app.get("/appointments/me", authMiddleware, async (req, res) => {
  try {
    const appointments = await sql`
          SELECT a.id, s.name AS service_name, a.date, a.time, a.status
          FROM appointments a
          JOIN services s ON a.service_id = s.id
          WHERE a.user_id = ${req.user.id}
      `;
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching user appointments:", error);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

app.get("/appointments", authMiddleware, adminMiddleware, async (_, res) => {
  try {
    const appointments = await sql`
          SELECT a.id, u.name AS user_name, s.name AS service_name, a.date, a.time, a.status
          FROM appointments a
          JOIN users u ON a.user_id = u.id
          JOIN services s ON a.service_id = s.id
      `;
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

app.put(
  "/appointments/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!["confirmed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    try {
      await sql`UPDATE appointments SET status = ${status} WHERE id = ${id}`;
      res.json({ message: "Appointment ${status} successfully" });
    } catch (error) {
      console.error("Error updating appointment status:", error);
      res.status(500).json({ message: "Error updating appointment status" });
    }
  }
);

app.post("/appointments", authMiddleware, async (req, res) => {
  const { service_id, date, time } = req.body;
  try {
    await sql`
          INSERT INTO appointments (user_id, service_id, date, time, status) 
          VALUES (${req.user.id}, ${service_id}, ${date}, ${time}, 'pending')
      `;
    res.status(201).json({
      message: "Appointment booked successfully, waiting for confirmation",
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    res.status(500).json({ message: "Error booking appointment" });
  }
});

app.delete(
  "/appointments/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { id } = req.params;
    try {
      await sql`DELETE FROM appointments WHERE id = ${id}`;
      res.json({ message: "Appointment deleted successfully" });
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Error deleting appointment" });
    }
  }
);

app.post("/reviews", authMiddleware, async (req, res) => {
  const { service_id, rating, comment } = req.body;

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }

  try {
    const existingReview = await sql`
          SELECT * FROM reviews WHERE user_id = ${req.user.id} AND service_id = ${service_id}
      `;
    if (existingReview.length > 0) {
      return res
        .status(400)
        .json({ message: "You have already reviewed this service" });
    }

    await sql`
          INSERT INTO reviews (user_id, service_id, rating, comment) 
          VALUES (${req.user.id}, ${service_id}, ${rating}, ${comment})
      `;
    res.status(201).json({ message: "Review added successfully" });
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ message: "Error adding review" });
  }
});

app.get("/reviews/:service_id", async (req, res) => {
  const { service_id } = req.params;
  try {
    const reviews = await sql`
          SELECT r.id, u.name AS user_name, r.rating, r.comment, r.created_at 
          FROM reviews r
          JOIN users u ON r.user_id = u.id
          WHERE r.service_id = ${service_id}
          ORDER BY r.created_at DESC
      `;
    res.json(reviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Error fetching reviews" });
  }
});

app.put("/reviews/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }

  try {
    const review = await sql`
          SELECT * FROM reviews WHERE id = ${id} AND user_id = ${req.user.id}
      `;
    if (review.length === 0) {
      return res
        .status(403)
        .json({ message: "You can only edit your own reviews" });
    }

    await sql`
          UPDATE reviews SET rating = ${rating}, comment = ${comment} WHERE id = ${id}
      `;
    res.json({ message: "Review updated successfully" });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ message: "Error updating review" });
  }
});

app.delete("/reviews/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const review = await sql`
          SELECT * FROM reviews WHERE id = ${id}
      `;

    if (review.length === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review[0].user_id !== req.user.id && !req.user.is_admin) {
      return res
        .status(403)
        .json({ message: "You can only delete your own reviews" });
    }

    await sql`DELETE FROM reviews WHERE id = ${id}`;
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Error deleting review" });
  }
});

app.get("/users/me", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user =
      await sql`SELECT id, name, email FROM users WHERE id = ${decoded.id}`;

    if (user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(401).json({ message: "Invalid token" });
  }
});

app.put("/users/update", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { name, email, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    let updateQuery = sql`
      UPDATE users SET name = ${name}, email = ${email}
      WHERE id = ${decoded.id}
    `;

    if (password) {
      const hashedPassword = hashPassword(password);
      updateQuery = sql`
        UPDATE users SET name = ${name}, email = ${email}, password = ${hashedPassword}
        WHERE id = ${decoded.id}
      `;
    }

    await updateQuery;
    res.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Error updating profile" });
  }
});

app.post("/favorites", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { service_id } = req.body;

    if (!service_id) {
      return res.status(400).json({ message: "Service ID is required" });
    }

    await sql`
      INSERT INTO favorites (user_id, service_id)
      VALUES (${decoded.id}, ${service_id})
      ON CONFLICT DO NOTHING
    `;

    res.json({ message: "Service added to favorites" });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    res.status(500).json({ message: "Error adding to favorites" });
  }
});

app.get("/favorites", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const favorites = await sql`
      SELECT services.id, services.name, services.description, services.price 
      FROM services 
      JOIN favorites ON services.id = favorites.service_id
      WHERE favorites.user_id = ${decoded.id}
    `;

    res.json(favorites);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({ message: "Error fetching favorites" });
  }
});

app.delete("/favorites", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { service_id } = req.body;

    if (!service_id) {
      return res.status(400).json({ message: "Service ID is required" });
    }

    await sql`
      DELETE FROM favorites 
      WHERE user_id = ${decoded.id} AND service_id = ${service_id}
    `;

    res.json({ message: "Service removed from favorites" });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    res.status(500).json({ message: "Error removing from favorites" });
  }
});

app.put("/users/block", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { user_id, is_blocked } = req.body;

    const adminCheck =
      await sql`SELECT is_admin FROM users WHERE id = ${decoded.id}`;
    if (adminCheck.length === 0 || !adminCheck[0].is_admin) {
      return res.status(403).json({ message: "Access denied" });
    }

    await sql`
      UPDATE users 
      SET is_blocked = ${is_blocked}
      WHERE id = ${user_id}
    `;

    res.json({
      message: `User ${is_blocked ? "blocked" : "unblocked"} successfully`,
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ message: "Error updating user status" });
  }
});

app.post("/working-hours", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const adminCheck =
      await sql`SELECT is_admin FROM users WHERE id = ${decoded.id}`;
    if (adminCheck.length === 0 || !adminCheck[0].is_admin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { day, open_time, close_time, max_appointments_per_slot } = req.body;

    await sql`
      INSERT INTO working_hours (day, open_time, close_time, max_appointments_per_slot)
      VALUES (${day}, ${open_time}, ${close_time}, ${max_appointments_per_slot})
      ON CONFLICT (day) 
      DO UPDATE SET open_time = ${open_time}, close_time = ${close_time}, max_appointments_per_slot = ${max_appointments_per_slot}
    `;

    res.json({ message: "Working hours updated successfully" });
  } catch (error) {
    console.error("Error updating working hours:", error);
    res.status(500).json({ message: "Error updating working hours" });
  }
});

app.listen(port, () =>
  console.log(`BeautySalon API is running on port ${port}`)
);
