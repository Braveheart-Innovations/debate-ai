const fs = require('fs');
const path = require('path');

// Create a simple test image (1x1 red pixel JPEG)
const testImageBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

const testImageBuffer = Buffer.from(testImageBase64, 'base64');
fs.writeFileSync(path.join(__dirname, 'test-image.jpg'), testImageBuffer);
console.log('Created test-image.jpg');

// Create a minimal valid PDF that says "Test Document"
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Document) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000260 00000 n 
0000000341 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
432
%%EOF`;

fs.writeFileSync(path.join(__dirname, 'test-document.pdf'), pdfContent);
console.log('Created test-document.pdf');

// Create a simple text document
const testTextContent = `Test Document Content

This is a test document with multiple lines.
It contains simple text that can be used for testing.

Section 1: Introduction
This document is used for testing document upload capabilities.

Section 2: Content
The content here is minimal but sufficient for testing purposes.

End of document.`;

fs.writeFileSync(path.join(__dirname, 'test-document.txt'), testTextContent);
console.log('Created test-document.txt');

console.log('\nAll test files created successfully!');