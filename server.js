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
// API: Lấy tất cả Acc đang còn hàng để hiện lên trang chủ
app.get("/api/products", async (req, res) => {
  try {
    // Chúng ta JOIN bảng products và product_images để lấy luôn ảnh đại diện
    const query = `
      SELECT p.*, i.image_url 
      FROM products p 
      LEFT JOIN product_images i ON p.id = i.product_id AND i.is_thumbnail = TRUE
      WHERE p.status = 'available'
      ORDER BY p.created_at DESC
    `;

    const [rows] = await db.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy danh sách:", error);
    res.status(500).json({ message: "Không thể lấy dữ liệu sản phẩm" });
  }
});

// API: Lấy chi tiết Acc theo Mã Số (ms)
app.get("/api/products/:ms", async (req, res) => {
  try {
    const { ms } = req.params;

    // 1. Lấy thông tin cơ bản của Acc
    const [product] = await db.query("SELECT * FROM products WHERE ms = ?", [
      ms,
    ]);

    if (product.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy Acc này" });
    }

    // 2. Lấy danh sách tất cả hình ảnh của Acc đó
    const [images] = await db.query(
      "SELECT image_url FROM product_images WHERE product_id = ?",
      [product[0].id],
    );

    // Gộp dữ liệu lại để trả về
    res.json({
      ...product[0],
      images: images.map((img) => img.image_url),
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi hệ thống", error: error.message });
  }
});

// API DANH MỤC ACC
app.get("/api/shop-categories", async (req, res) => {
  try {
    const [categories] = await db.query(`
      SELECT 
        id,
        name,
        description
      FROM categories
      ORDER BY id DESC
    `);

    res.json(categories);
  } catch (error) {
    res.status(500).json({
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// API: Lấy toàn bộ acc CHƯA BÁN theo danh mục
app.get("/api/shop-accounts-by-category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;

    const [products] = await db.query(
      `
        SELECT 
          products.id,
          products.ms,
          products.title,
          products.price,
          products.rank_level,
          products.skin_count,
          products.status,
          categories.name AS category_name,

          (
            SELECT image_url
            FROM product_images
            WHERE product_images.product_id = products.id
            AND is_thumbnail = 1
            LIMIT 1
          ) AS image_url

        FROM products

        LEFT JOIN categories
        ON products.category_id = categories.id

        WHERE 
          products.category_id = ?
          AND products.status = 'available'

        ORDER BY products.created_at DESC
        `,
      [categoryId],
    );

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: "Lỗi server",
      error: error.message,
    });
  }
});

// API: Cập nhật Profile người dùng
app.put("/api/users/update-profile", async (req, res) => {
  try {
    const { user_id, full_name, phone, age } = req.body;

    const query = `
      UPDATE users 
      SET full_name = ?, phone = ?, age = ? 
      WHERE id = ?
    `;

    await db.query(query, [full_name, phone, age, user_id]);

    res.json({ message: "Cập nhật thông tin thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi cập nhật", error: error.message });
  }
});

// API: Mua Acc
app.post("/api/buy", async (req, res) => {
  try {
    const { user_id, product_id } = req.body;

    // 1. Kiểm tra số dư người dùng và trạng thái Acc
    const [[user]] = await db.query("SELECT balance FROM users WHERE id = ?", [
      user_id,
    ]);
    const [[product]] = await db.query(
      "SELECT price, status, ms FROM products WHERE id = ?",
      [product_id],
    );

    if (!product || product.status !== "available") {
      return res
        .status(400)
        .json({ message: "Acc này đã bị người khác mua mất rồi!" });
    }

    if (user.balance < product.price) {
      return res
        .status(400)
        .json({ message: "Số dư không đủ, vui lòng nạp thêm tiền!" });
    }

    // 2. Thực hiện giao dịch (Trừ tiền và Cập nhật trạng thái)
    const orderCode = `BILL${Date.now()}`; // Tạo mã hóa đơn tự động theo thời gian

    // Trừ tiền khách
    await db.query("UPDATE users SET balance = balance - ? WHERE id = ?", [
      product.price,
      user_id,
    ]);

    // Đổi trạng thái Acc sang 'sold'
    await db.query("UPDATE products SET status = 'sold' WHERE id = ?", [
      product_id,
    ]);

    // Lưu vào lịch sử đơn hàng
    await db.query(
      "INSERT INTO orders (order_code, user_id, product_id, total_price, status) VALUES (?, ?, ?, ?, 'processing')",
      [orderCode, user_id, product_id, product.price],
    );

    res.json({
      message: "Mua thành công!",
      order_code: orderCode,
      note: "Vui lòng gửi mã hóa đơn này qua Zalo để nhận Acc.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Giao dịch thất bại" });
  }
});

const bcrypt = require("bcrypt");
const saltRounds = 10; // Độ phức tạp của mã hóa

// --- API ĐĂNG KÝ ---
app.post("/api/register", async (req, res) => {
  try {
    const { username, password, email, full_name } = req.body;

    // 1. Kiểm tra xem user đã tồn tại chưa
    const [existingUser] = await db.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại!" });
    }

    // 2. Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Lưu vào database
    await db.query(
      "INSERT INTO users (username, password, email, full_name, balance, role) VALUES (?, ?, ?, ?, 0, 'user')",
      [username, hashedPassword, email, full_name],
    );

    res.json({ message: "Đăng ký tài khoản thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi đăng ký", error: error.message });
  }
});

// --- API ĐĂNG NHẬP ---
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Tìm user trong DB
    const [users] = await db.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);
    if (users.length === 0) {
      return res.status(404).json({ message: "Tài khoản không tồn tại!" });
    }

    const user = users[0];

    // 2. So sánh mật khẩu gửi lên với mật khẩu đã mã hóa trong DB
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Mật khẩu không chính xác!" });
    }

    // 3. Trả về thông tin user (trừ mật khẩu)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: "Đăng nhập thành công!",
      user: userWithoutPassword,
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi đăng nhập", error: error.message });
  }
});

// --- API ĐỔI MẬT KHẨU ---
app.put("/api/users/change-password", async (req, res) => {
  try {
    const { user_id, oldPassword, newPassword } = req.body;

    // 1. Lấy mật khẩu cũ trong DB
    const [[user]] = await db.query("SELECT password FROM users WHERE id = ?", [
      user_id,
    ]);

    // 2. Kiểm tra mật khẩu cũ có đúng không
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu cũ không đúng!" });
    }

    // 3. Mã hóa mật khẩu mới và cập nhật
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedNewPassword,
      user_id,
    ]);

    res.json({ message: "Đổi mật khẩu thành công!" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi đổi mật khẩu" });
  }
});

// 4. Khởi động Server (Chỉ dùng 1 lệnh listen duy nhất)
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});
