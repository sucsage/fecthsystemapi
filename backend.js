const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const app = express();
const port = 3000;
const multer = require('multer');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Data file paths
const PRODUCTS_FILE_XLSX = path.join(__dirname, 'data', 'products.xlsx');
const ORDERS_FILE_XLSX = path.join(__dirname, 'data', 'orders.xlsx');

const imagesPath = path.join(__dirname, 'images');

app.use('/images', express.static(imagesPath));

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath);
}
function generateRandomFilename(originalName) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}-${Date.now()}${ext}`; // ตัวอย่างการสร้างชื่อไฟล์ใหม่
}
// กำหนด storage engine สำหรับ multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imagesPath);
    },
    filename: (req, file, cb) => {
        const randomFilename = generateRandomFilename(file.originalname);
        cb(null, randomFilename);
    }
});

// สร้าง middleware สำหรับอัปโหลดไฟล์เดียว (รูปภาพสินค้า)
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
}).single('productImage'); // 'productImage' คือ name ของ input type="file" ใน form

// Helper functions for data management (Excel)
function readFromExcel(filePath, sheetName = 0) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sName = typeof sheetName === 'number' ? workbook.SheetNames[sheetName] : sheetName;
        const worksheet = workbook.Sheets[sName];
        return XLSX.utils.sheet_to_json(worksheet);
    } catch (error) {
        console.error(`Error reading from Excel file ${filePath}:`, error);
        return [];
    }
}

function writeToExcel(filePath, data, sheetName = 'Sheet1') {
    try {
        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
        XLSX.writeFile(newWorkbook, filePath);
    } catch (error) {
        console.error(`Error writing to Excel file ${filePath}:`, error);
    }
}

// Initialize product data if file doesn't exist
if (!fs.existsSync(PRODUCTS_FILE_XLSX)) {
    const initialProducts = [
        { id: 1, name: "Wireless Headphones", price: 89.99, description: "Premium noise-cancelling wireless headphones with 30-hour battery life.", image: "https://via.placeholder.com/300x300?text=Headphones" },
        { id: 2, name: "Smartphone", price: 699.99, description: "Latest model smartphone with high-resolution camera and all-day battery life.", image: "https://via.placeholder.com/300x300?text=Smartphone" },
        { id: 3, name: "Laptop", price: 1299.99, description: "Powerful laptop with fast processor and high-resolution display.", image: "https://via.placeholder.com/300x300?text=Laptop" },
        { id: 4, name: "Smartwatch", price: 249.99, description: "Fitness tracking smartwatch with heart rate monitor and GPS.", image: "https://via.placeholder.com/300x300?text=Smartwatch" },
        { id: 5, name: "Bluetooth Speaker", price: 79.99, description: "Portable Bluetooth speaker with rich sound and waterproof design.", image: "https://via.placeholder.com/300x300?text=Speaker" },
        { id: 6, name: "Tablet", price: 399.99, description: "10-inch tablet with high-resolution display and long battery life.", image: "https://via.placeholder.com/300x300?text=Tablet" }
    ];
    writeToExcel(PRODUCTS_FILE_XLSX, initialProducts, 'Products');
}

// Initialize orders data if file doesn't exist
if (!fs.existsSync(ORDERS_FILE_XLSX)) {
    writeToExcel(ORDERS_FILE_XLSX, [], 'Orders');
}

// API Routes for Products

// Get all products
app.get('/api/products', (req, res) => {
    try {
        const products = readFromExcel(PRODUCTS_FILE_XLSX);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get product by ID
app.get('/api/products/:id', (req, res) => {
    try {
        const products = readFromExcel(PRODUCTS_FILE_XLSX);
        const productId = parseInt(req.params.id);
        const product = products.find(p => p.id === productId);

        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Create new product
app.post('/api/products', upload, async (req, res) => {
    try {
        let imageName = null;
        if (req.file) {
            imageName = req.file.filename;
        }

        const products = readFromExcel(PRODUCTS_FILE_XLSX);
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        const price = parseFloat(req.body.price);
        if (isNaN(price)) {
            return res.status(400).json({ error: 'Invalid price format' });
        }
        const newProduct = { id: newId, ...req.body, price: price, image: req.file ? req.file.filename : null }; // ใช้ price ที่แปลงแล้ว

        products.push(newProduct);
        writeToExcel(PRODUCTS_FILE_XLSX, products, 'Products');

        // ส่งกลับเฉพาะชื่อไฟล์ใน response
        res.status(201).json({ ...newProduct, productImage: imageName });

    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
        if (req.file && fs.existsSync(path.join(imagesPath, req.file.filename))) {
            fs.unlinkSync(path.join(imagesPath, req.file.filename));
        }
    }
});
  
// Update product
app.put('/api/products/:id', upload, async (req, res) => {
    try {
        let products = readFromExcel(PRODUCTS_FILE_XLSX);
        const productIdToUpdate = parseInt(req.params.id);
        const productIndex = products.findIndex(p => p.id === productIdToUpdate);

        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const updatedProductData = {
            id: productIdToUpdate,
            name: req.body.name,
            price: parseFloat(req.body.price),
            description: req.body.description,
            image: req.file ? req.file.filename : req.body.oldImage // ใช้ชื่อไฟล์ใหม่ ถ้ามีการอัปโหลด
        };

        // ลบรูปภาพเก่าถ้ามีการอัปโหลดรูปภาพใหม่
        if (req.file && products[productIndex].image && products[productIndex].image !== req.file.filename) {
            const oldImagePath = path.join(imagesPath, products[productIndex].image);
            try {
                await fs.promises.unlink(oldImagePath);
                console.log(`Old image deleted: ${oldImagePath}`);
            } catch (error) {
                console.error(`Error deleting old image ${oldImagePath}:`, error);
                // ไม่จำเป็นต้อง throw error ที่นี่ การอัปเดตสินค้าหลักยังถือว่าสำเร็จ
            }
        }

        products[productIndex] = updatedProductData;
        writeToExcel(PRODUCTS_FILE_XLSX, products, 'Products');
        res.json(updatedProductData);

    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
        // ลบไฟล์ที่อัปโหลดใหม่หากเกิดข้อผิดพลาดในการประมวลผล
        if (req.file) {
            try {
                await fs.promises.unlink(path.join(IMAGES_PATH, req.file.filename));
            } catch (err) {
                console.error('Error deleting uploaded file after error:', err);
            }
        }
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        let products = readFromExcel(PRODUCTS_FILE_XLSX);
        const productIdToDelete = parseInt(req.params.id);
        const initialLength = products.length;
        const productToDelete = products.find(p => p.id === productIdToDelete);

        products = products.filter(p => p.id !== productIdToDelete);

        if (products.length < initialLength) {
            writeToExcel(PRODUCTS_FILE_XLSX, products, 'Products');

            // ลบไฟล์รูปภาพ (ถ้ามี)
            if (productToDelete && productToDelete.image) {
                const imagePath = path.join(imagesPath, productToDelete.image);
                try {
                    await fs.promises.unlink(imagePath);
                    console.log(`Image deleted: ${imagePath}`);
                } catch (error) {
                    console.error(`Error deleting image ${imagePath}:`, error);
                    // ไม่จำเป็นต้อง throw error ที่นี่ เพราะการลบสินค้าหลักสำเร็จแล้ว
                    // คุณอาจต้องการ logging หรือการจัดการข้อผิดพลาดอื่น ๆ
                }
            }

            res.json({ message: 'Product and associated image deleted successfully' });
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// API Routes for Orders

// Get all orders
app.get('/api/orders', (req, res) => {
    try {
        const orders = readFromExcel(ORDERS_FILE_XLSX, 'Orders');
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Create new order
app.post('/api/orders', (req, res) => {
    try {
        const orders = readFromExcel(ORDERS_FILE_XLSX, 'Orders');
        const newId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;
        const newOrder = { id: newId, ...req.body, status: 'pending', date: new Date().toISOString() };
        orders.push(newOrder);
        writeToExcel(ORDERS_FILE_XLSX, orders, 'Orders');
        res.status(201).json(newOrder);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`- Front-end: http://localhost:${port}`);
    console.log(`- API: http://localhost:${port}/api/products`);
});