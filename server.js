const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { neon } = require("@neondatabase/serverless");
const port = 5000;
const sql = neon(process.env.DATABASE_URL);

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
  const { email, password } = req.body;
  const hashedPassword = hashPassword(password);
  try {
    const user =
      await sql`SELECT * FROM users WHERE email = ${email} AND password = ${hashedPassword}`;
    if (user.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    res.json({ message: "Login successful", userId: user[0].id });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Error logging in" });
  }
});

app.get("/users", async (_, res) => {
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

app.post("/services", async (req, res) => {
  const { name, price, duration } = req.body;
  try {
    await sql`INSERT INTO services (name, price, duration) VALUES (${name}, ${price}, ${duration})`;
    res.status(201).json({ message: "Service added successfully" });
  } catch (error) {
    console.error("Error adding service:", error);
    res.status(500).json({ message: "Error adding service" });
  }
});

app.delete("/services/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM services WHERE id = ${id}`;
    res.json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ message: "Error deleting service" });
  }
});

app.get("/appointments", async (_, res) => {
  try {
    const appointments = await sql`SELECT * FROM appointments`;
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Error fetching appointments" });
  }
});

app.post("/appointments", async (req, res) => {
  const { user_id, service_id, date, time } = req.body;
  try {
    await sql`INSERT INTO appointments (user_id, service_id, date, time) VALUES (${user_id}, ${service_id}, ${date}, ${time})`;
    res.status(201).json({ message: "Appointment booked successfully" });
  } catch (error) {
    console.error("Error booking appointment:", error);
    res.status(500).json({ message: "Error booking appointment" });
  }
});

app.delete("/appointments/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await sql`DELETE FROM appointments WHERE id = ${id}`;
    res.json({ message: "Appointment deleted successfully" });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Error deleting appointment" });
  }
});

app.listen(port, () =>
  console.log(`Beauty Salon API is running on port ${port}`)
);
