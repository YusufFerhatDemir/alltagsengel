const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, HeadingLevel } = require('docx');

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        text: 'Test',
        heading: HeadingLevel.HEADING_1,
      }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 2000, type: WidthType.DXA },
                children: [new Paragraph({
                  text: 'Test',
                })],
              }),
            ],
          }),
        ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  console.log('Success');
});
