const fs = require('fs'), path = require('path')
const { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType, BorderStyle, Header, Footer, PageNumber } = require('docx')
const AZUL='1F3864', CINZA='595959', VERM='9A2A16', AMB='8A6100', VERDE='1E6B3A'
const md = fs.readFileSync(process.argv[2], 'utf8').split('\n')
const SAIDA = process.argv[3]
const t=(s,o={})=>new TextRun({text:s,font:'Calibri',size:o.size||20,bold:o.bold,italics:o.italics,color:o.color})
const filhos=[]
let primeiroH2=true
for (const l of md) {
  if (l.startsWith('# ')) {
    filhos.push(new Paragraph({spacing:{after:200},border:{bottom:{style:BorderStyle.SINGLE,size:8,color:AZUL,space:6}},children:[t(l.slice(2),{bold:true,size:32,color:AZUL})]}))
  } else if (l.startsWith('## ')) {
    if (!primeiroH2) filhos.push(new Paragraph({children:[new PageBreak()]}))
    primeiroH2=false
    const txt=l.slice(3)
    const cor = txt.includes('[ALTA]')?VERM : txt.includes('[MEDIA]')?AMB : txt.includes('[BAIXA]')?VERDE : AZUL
    filhos.push(new Paragraph({spacing:{before:120,after:120},children:[t(txt,{bold:true,size:24,color:cor})]}))
  } else if (l.startsWith('### ')) {
    filhos.push(new Paragraph({spacing:{before:200,after:80},children:[t(l.slice(4),{bold:true,size:21,color:AZUL})]}))
  } else if (l.trim()==='') {
    continue
  } else {
    const partes = l.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p =>
      p.startsWith('**') ? t(p.slice(2,-2),{bold:true}) : t(p))
    filhos.push(new Paragraph({spacing:{after:120},alignment:AlignmentType.JUSTIFIED,children:partes}))
  }
}
const doc=new Document({
  creator:'Banca 01 — Concurso Faeg Jovem 2026',
  title: path.basename(SAIDA,'.docx'),
  styles:{default:{document:{run:{font:'Calibri',size:20}}}},
  sections:[{properties:{page:{margin:{top:900,right:1000,bottom:900,left:1000}}},
    headers:{default:new Header({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[t('Faeg Jovem 2026 · Etapa Regional · 1ª Ação Social · Banca 01',{size:14,color:CINZA})]})]})},
    footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],size:14,color:CINZA,font:'Calibri'})]})]})},
    children:filhos}]})
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(SAIDA,b);console.log('gerado:',SAIDA,'|',filhos.length,'parágrafos')})
