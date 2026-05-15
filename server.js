// 1. Khai báo các thư viện (Chỉ khai báo 1 lần duy nhất)
const express = require("express");
const cors = require("cors");
const db = require("./config/db"); // Đảm bảo đường dẫn này đúng
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// 2. Cấu hình Middleware
app.use(cors());
app.use(express.json());

// 3. Các đường dẫn (Routes)
// Route kiểm tra server
app.get("/", (req, res) => {
  res.send("Backend của Shop Acc đang chạy thành công!");
});

// API lấy danh sách tài khoản game từ MySQL
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM products");
    res.json(rows);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({
      message: "Lỗi kết nối database",
      error: error.message,
    });
  }
});

// 4. Khởi động Server (Chỉ dùng 1 lệnh listen duy nhất)
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});
