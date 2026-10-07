from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)

BRAND = colors.HexColor("#5B21B6")
INK = colors.HexColor("#18212B")
MUTED = colors.HexColor("#566273")
LINE = colors.HexColor("#D9E0E8")
PALE = colors.HexColor("#F5F3FF")


def money(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def document(path: Path, title: str, subtitle: str, sections: list[tuple[str, list[tuple[str, float]]]], footer: str):
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="FixtureTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=5))
    styles.add(ParagraphStyle(name="FixtureSub", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=14, textColor=MUTED, spaceAfter=14))
    styles.add(ParagraphStyle(name="FixtureSection", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=BRAND, spaceBefore=12, spaceAfter=5))
    styles.add(ParagraphStyle(name="FixtureFooter", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=MUTED, spaceBefore=15))

    def page(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(BRAND)
        canvas.rect(0, A4[1] - 14 * mm, A4[0], 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(18 * mm, A4[1] - 9 * mm, "PRALIS - HOMOLOGACAO LOCAL")
        canvas.restoreState()

    flow = [Spacer(1, 18 * mm), Paragraph("AMBIENTE DE HOMOLOGACAO - DOCUMENTO FICTICIO", styles["FixtureSub"]), Paragraph(title, styles["FixtureTitle"]), Paragraph(subtitle, styles["FixtureSub"])]
    for heading, rows in sections:
        flow.append(Paragraph(heading, styles["FixtureSection"]))
        total = sum(value for _, value in rows)
        table_data = [["Descricao", "Valor"]] + [[label, money(value)] for label, value in rows] + [["Total", money(total)]]
        table = Table(table_data, colWidths=[125 * mm, 45 * mm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), PALE),
            ("TEXTCOLOR", (0, -1), (-1, -1), BRAND),
            ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        flow.extend([table, Spacer(1, 4 * mm)])
    flow.append(Paragraph(footer, styles["FixtureFooter"]))
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=14 * mm, bottomMargin=18 * mm).build(flow, onFirstPage=page, onLaterPages=page)


document(
    OUTPUT / "qa-pdv-01-manha-creare.pdf",
    "Relatorio CREARE - PDV 01 - Manha",
    "Periodo ficticio: 06/10/2026, 08:00 a 12:00. Use nesta homologacao para conferir o turno da manha.",
    [("Vendas por forma de pagamento", [("Dinheiro", 50), ("Credito", 31.5), ("Debito", 18.5), ("Pix", 22), ("Voucher", 14)])],
    "Resultado CREARE do turno: R$ 136,00. Nenhuma despesa no relatorio CREARE. Este arquivo e apenas para teste local.",
)
document(
    OUTPUT / "qa-pdv-01-tarde-creare.pdf",
    "Relatorio CREARE - PDV 01 - Tarde",
    "Periodo ficticio: 06/10/2026, 13:00 a 18:00. Use nesta homologacao para conferir o turno da tarde.",
    [("Vendas por forma de pagamento", [("Dinheiro", 120), ("Credito", 45), ("Debito", 20), ("Pix", 30), ("Voucher", 10)])],
    "Resultado CREARE do turno: R$ 225,00. A leitura da maquininha da tarde e acumulada e deve descontar a manha.",
)
document(
    OUTPUT / "qa-pdv-01-manha-maquininha.pdf",
    "Comprovante da maquininha - PDV 01 - Manha",
    "Leitura acumulada ficticia ao fechar o turno da manha. Maquina exclusiva do PDV 01.",
    [("Acumulado por forma recebivel", [("Credito", 31.5), ("Debito", 18.5), ("Pix", 22), ("Voucher", 14)])],
    "Liquido do turno da manha: os proprios valores acima. Dinheiro nao entra na maquininha.",
)
document(
    OUTPUT / "qa-pdv-01-tarde-maquininha-acumulado.pdf",
    "Comprovante da maquininha - PDV 01 - Tarde",
    "Leitura acumulada ficticia ao fechar o turno da tarde. O sistema deve subtrair a leitura da manha.",
    [
        ("Acumulado exibido pela maquininha", [("Credito", 76.5), ("Debito", 38.5), ("Pix", 52), ("Voucher", 24)]),
        ("Liquido esperado somente da tarde", [("Credito", 45), ("Debito", 20), ("Pix", 30), ("Voucher", 10)]),
    ],
    "Regra de teste: acumulado da tarde menos manha gera R$ 105,00, igual aos recebiveis do CREARE da tarde.",
)
