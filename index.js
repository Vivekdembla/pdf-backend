// Backend: Node.js + Express
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const path = require("path");
const cors = require("cors");

const app = express();
const port = 5001;
app.use(express.json());
app.use(cors());

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Upload and process the PDF
app.post("/upload-template", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const pdfBytes = fs.readFileSync(filePath);
    const pdfData = await pdfParse(pdfBytes);
    const textContent = pdfData.text;

    // Extract placeholders (assuming placeholders are in {{key}} format)
    const placeholderRegex = /{{(.*?)}}/g;
    const placeholders = new Set();
    let match;
    while ((match = placeholderRegex.exec(textContent)) !== null) {
      placeholders.add(match[1]);
    }

    res.json({
      message: "File uploaded successfully",
      filePath,
      placeholders: Array.from(placeholders),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload PDF template" });
  }
});

// Replace placeholders and generate final PDF
app.post("/generate-pdf", async (req, res) => {
  try {
    const { filePath, data } = req.body;
    if (!filePath || !data) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    let page = pages[0]; // Assuming single-page PDF
    let { width, height } = page.getSize();

    // Draw a white rectangle over the entire page to clear previous text
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 1, 1),
    });

    // Extract text and replace placeholders
    const pdfData = await pdfParse(pdfBytes);
    let text = pdfData.text;
    Object.entries(data).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      text = text.replaceAll(placeholder, value);
    });

    // Redraw modified text
    page.drawText(text, {
      x: 50,
      y: height - 50,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
    });

    const modifiedPdfBytes = await pdfDoc.save();
    const outputFilePath = path.join("uploads", "output.pdf");
    fs.writeFileSync(outputFilePath, modifiedPdfBytes);

    // fs.unlinkSync(filePath); // Delete original template after processing
    res.json({
      message: "PDF generated successfully",
      downloadPath: `http://localhost:${port}/download-pdf`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

// Serve the processed PDF for download
app.get("/download-pdf", (req, res) => {
  try {
    const outputFilePath = path.join("uploads", "output.pdf");
    res.download(outputFilePath, "processed.pdf", () => {
      fs.unlinkSync(outputFilePath); // Delete processed PDF after download
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to download PDF" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

app.post("/generate-template", async (req, res) => {
  try {
    console.log("Received request for template generation");

    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: "No text input provided" });
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]); // Set page size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 16;
    const { width, height } = page.getSize();

    // Draw text on the PDF
    page.drawText(input, {
      x: 50,
      y: height - 100,
      size: fontSize,
      font,
      color: rgb(0, 0, 0), // Black text
    });

    console.log("Text added to PDF");

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Define output file path
    const outputDir = path.join(__dirname, "uploads");
    const outputFilePath = path.join(outputDir, "template.pdf");

    // Ensure the 'uploads' directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the modified PDF to the file system
    fs.writeFileSync(outputFilePath, modifiedPdfBytes);
    console.log("Template saved successfully at:", outputFilePath);

    res.json({
      message: "Template generated successfully",
      downloadPath: `http://localhost:${port}/download-template`,
    });
  } catch (error) {
    console.error("Error generating template:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

app.get("/download-template", (req, res) => {
  try {
    const outputFilePath = path.join("uploads", "template.pdf");
    res.download(outputFilePath, "template.pdf", () => {
      fs.unlinkSync(outputFilePath); // Delete processed PDF after download
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to download PDF" });
  }
});
