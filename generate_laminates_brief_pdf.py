"""
InvenIQ — AI-Powered Inventory Intelligence for the Laminates Industry
Generates a focused solution-brief PDF covering 5 selected modules
(out of the platform's full 37-module suite).
Output: c:\\InvenIQ\\InvenIQ_Laminates_Industry_Brief.pdf
"""
from fpdf import FPDF
import os


def clean(text):
    return (text
        .replace('—', ' - ')
        .replace('–', '-')
        .replace('‘', "'")
        .replace('’', "'")
        .replace('“', '"')
        .replace('”', '"')
        .replace('•', '*')
        .replace('…', '...')
        .replace(' ', ' ')
        .replace('→', '->')
        .replace('·', '*')
    )


NAVY = (13, 27, 62)
GREEN = (0, 140, 100)
GREEN_LIGHT = (228, 244, 238)
ACCENT = (0, 210, 150)


class BriefPDF(FPDF):

    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 16, 'F')
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(255, 255, 255)
        self.set_y(4)
        self.cell(0, 8, 'InvenIQ  |  AI for the Laminates & Building Materials Trade', align='C')
        self.set_text_color(0, 0, 0)
        self.set_y(18)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-12)
        self.set_fill_color(*NAVY)
        self.rect(0, 285, 210, 12, 'F')
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(200, 200, 200)
        self.cell(0, 8,
            'Page %d  |  InvenIQ Solution Brief  |  Confidential - Selected Modules Only' % self.page_no(),
            align='C')
        self.set_text_color(0, 0, 0)

    def section_title(self, title):
        self.ln(3)
        self.set_fill_color(*NAVY)
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(255, 255, 255)
        self.set_x(10)
        self.cell(190, 8, '  ' + clean(title), fill=True)
        self.set_fill_color(*GREEN)
        self.rect(10, self.get_y(), 190, 1.2, 'F')
        self.ln(10)
        self.set_text_color(0, 0, 0)

    def module_title(self, num, title):
        self.ln(2)
        self.set_fill_color(*GREEN_LIGHT)
        self.set_draw_color(*GREEN)
        self.set_line_width(0.5)
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*NAVY)
        self.set_x(10)
        self.cell(190, 8, '  Module %s  -  %s' % (num, clean(title)), border='L', fill=True)
        self.ln(9)
        self.set_text_color(0, 0, 0)

    def sub_heading(self, text):
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(0, 110, 75)
        self.set_x(14)
        self.cell(0, 6, clean(text))
        self.ln(6)
        self.set_text_color(0, 0, 0)

    def body(self, text, indent=14):
        self.set_font('Helvetica', '', 9)
        self.set_text_color(45, 45, 45)
        self.set_x(indent)
        self.multi_cell(186 - (indent - 10), 5.5, clean(text))
        self.ln(1)

    def bullet(self, text, indent=18):
        self.set_font('Helvetica', '', 9)
        self.set_text_color(45, 45, 45)
        y_before = self.get_y()
        self.set_x(indent)
        self.cell(5, 5.5, '-')
        self.set_xy(indent + 5, y_before)
        self.multi_cell(178 - (indent - 10), 5.5, clean(text))

    def table(self, rows, col_widths, header=None, header_fill=NAVY):
        self.set_draw_color(180, 180, 180)
        self.set_line_width(0.2)
        if header:
            self.set_fill_color(*header_fill)
            self.set_font('Helvetica', 'B', 8.5)
            self.set_text_color(255, 255, 255)
            self.set_x(12)
            for w, h in zip(col_widths, header):
                self.cell(w, 7, '  ' + clean(h), border=1, fill=True)
            self.ln(7)
        for i, row in enumerate(rows):
            fill = (i % 2 == 0)
            self.set_fill_color(*GREEN_LIGHT) if fill else self.set_fill_color(255, 255, 255)
            self.set_font('Helvetica', '', 8)
            self.set_text_color(45, 45, 45)
            self.set_x(12)
            y_before = self.get_y()
            max_h = 6
            for w, c in zip(col_widths, row):
                lines = self.multi_cell(w, 5.5, clean(c), border=0, align='L', dry_run=True, output='LINES')
                max_h = max(max_h, len(lines) * 5.5)
            for w, c in zip(col_widths, row):
                x = self.get_x()
                self.multi_cell(w, max_h, '', border=1, fill=fill)
                self.set_xy(x, y_before)
                self.set_x(x + 1)
                self.multi_cell(w - 2, 5.5, clean(c), border=0, fill=False)
                self.set_xy(x + w, y_before)
            self.set_y(y_before + max_h)
        self.ln(2)


def build_pdf():
    pdf = BriefPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(10, 20, 10)

    # =========================================================================
    # COVER PAGE
    # =========================================================================
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 0, 210, 55, 'F')
    pdf.set_fill_color(*GREEN)
    pdf.rect(0, 55, 210, 3, 'F')

    pdf.set_font('Helvetica', 'B', 26)
    pdf.set_text_color(255, 255, 255)
    pdf.set_y(16)
    pdf.cell(0, 12, 'InvenIQ', align='C')
    pdf.ln(13)
    pdf.set_font('Helvetica', 'B', 13)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 8, 'AI-Powered Inventory Intelligence', align='C')
    pdf.ln(8)
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(210, 225, 235)
    pdf.cell(0, 7, 'Built for the Laminates & Building Materials Trade', align='C')

    pdf.set_y(68)
    pdf.set_font('Helvetica', 'B', 14)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 8, 'Industry Solution Brief', align='C')
    pdf.ln(8)
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 7, 'A focused look at how AI solves the laminates trade biggest operating problems', align='C')

    pdf.set_y(100)
    pdf.set_draw_color(*GREEN)
    pdf.set_line_width(0.4)
    info = [
        ('Document Type',   'Solution Brief - Selected Capabilities'),
        ('Industry Focus',  'Laminates, Decorative Surfaces & Building Materials'),
        ('Modules Covered', '5 selected modules (of 37+ in the full platform)'),
        ('AI Engine',       'GPT-4o conversational + visual intelligence'),
        ('Prepared',        'June 2026'),
    ]
    for label, value in info:
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(*NAVY)
        pdf.set_x(26)
        pdf.cell(55, 10, label + ':', border='B')
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(125, 10, value, border='B')
        pdf.ln(12)

    pdf.set_fill_color(*GREEN)
    pdf.rect(0, 262, 210, 2, 'F')
    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 264, 210, 33, 'F')
    pdf.set_y(270)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 6, 'CONFIDENTIAL  -  PREPARED FOR INDUSTRY EVALUATION', align='C')
    pdf.ln(7)
    pdf.set_font('Helvetica', 'I', 8)
    pdf.set_text_color(160, 160, 160)
    pdf.cell(0, 6,
        'This brief covers a curated subset of modules. Full platform capabilities available on request.',
        align='C')

    pdf.set_auto_page_break(auto=True, margin=20)

    # =========================================================================
    # PAGE 2: About + Why Laminates Businesses Need This
    # =========================================================================
    pdf.add_page()

    pdf.section_title('What is InvenIQ?')
    pdf.body(
        'InvenIQ is an AI-powered inventory intelligence platform for B2B distributors and '
        'manufacturers of building materials. It replaces spreadsheets and scattered registers '
        'with live operational dashboards and a conversational AI assistant (powered by GPT-4o) '
        'that understands your actual business data - stock, sales, distributors, and demand - '
        'and can answer questions, flag problems, and take action on it directly.'
    )

    pdf.section_title('Why the Laminates Industry Needs This')
    pain_points = [
        'Huge SKU sprawl: hundreds of decor, finish, thickness and size combinations per brand '
        'make manual stock tracking unreliable at any real scale.',
        'Silent dead stock: discontinued decors and out-of-fashion patterns quietly lock up '
        'working capital for months before anyone notices the shelf has stopped moving.',
        'Dealer network complexity: multi-tier distributor schemes and volume-based discount '
        'slabs are negotiated individually and tracked in spreadsheets - slow to reconcile and '
        'easy to get wrong, which erodes dealer trust when payouts are late or incorrect.',
        'Demand volatility: decor and finish trends shift with interior design fashion cycles - '
        'without forecasting, businesses overstock fading patterns while bestsellers run out.',
        'Reporting lag: by the time a management report is compiled by hand, the numbers in it '
        'are already a week old.',
    ]
    for p in pain_points:
        pdf.bullet(p)
    pdf.ln(2)

    pdf.section_title('The 5 Modules in This Brief')
    pdf.table(
        [
            ('1', 'Inventory & Dead-Stock Intelligence', 'Stop capital getting trapped in slow-moving decors'),
            ('2', 'AI Demand Forecasting', 'Stock the patterns that will actually sell'),
            ('3', 'Distributor Discount & Scheme Management', 'Run dealer schemes accurately, without spreadsheets'),
            ('4', 'AI Photo-to-Catalog Product Search', 'Identify any sample or SKU in seconds, from a photo'),
            ('5', 'AI Business Assistant', 'A 24/7 analyst that answers in plain English'),
        ],
        col_widths=[10, 75, 95],
        header=('#', 'Module', 'What It Solves'),
    )

    # =========================================================================
    # PAGE 3: Module 1 + Module 2
    # =========================================================================
    pdf.add_page()
    pdf.section_title('Selected Modules - Detail')

    pdf.module_title('1', 'Inventory & Dead-Stock Intelligence')
    pdf.sub_heading('The Problem')
    pdf.body(
        'With hundreds of decor/finish/thickness SKUs in circulation, most laminates businesses '
        'have no real-time view of what is actually moving versus what is quietly sitting in a '
        'warehouse corner. Capital stays trapped in slow-moving stock until a physical count '
        'finally surfaces it - often months too late.'
    )
    pdf.sub_heading('How InvenIQ Solves It')
    for f in [
        'A SKU-level stock ledger records every movement - receipts, dispatches, returns and '
        'damage write-offs - so current stock position is always accurate, not estimated.',
        'An automatic dead-stock detection engine flags any SKU with zero movement beyond a '
        'configurable threshold (default 90 days) - no manual audit required.',
        'A live KPI dashboard surfaces Total SKUs, Total Stock Value, Items Below Reorder Level, '
        'and Dead-Stock Count at a glance, filterable by period (Today / MTD / QTD / YTD).',
        'The AI assistant can be asked directly - "which decors have not moved in 3 months?" - '
        'and answers instantly from live data instead of someone building a report.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Business Impact')
    pdf.body(
        'Slow-moving decors get identified and cleared while they still have resale value, '
        'instead of becoming a write-off. Reorder decisions are based on real stock data, not '
        'guesswork or a warehouse manager\'s memory.'
    )
    pdf.ln(2)

    pdf.module_title('2', 'AI Demand Forecasting')
    pdf.sub_heading('The Problem')
    pdf.body(
        'Decor and finish trends move with interior design fashion cycles. Ordering the wrong '
        'mix means warehouse space full of patterns nobody wants, while the decors customers are '
        'actually asking for keep running out.'
    )
    pdf.sub_heading('How InvenIQ Solves It')
    for f in [
        'A built-in demand intelligence engine analyses real sales history to surface trend '
        'direction per product and category - rising, falling, or steady.',
        'Ask the AI assistant in plain English - "what should I stock more of this quarter?" - '
        'and get a live, data-backed answer instead of a gut-feel guess.',
        'A proactive insight engine flags demand spikes and slow decline automatically, '
        'surfacing the warning before a stockout or an overstock situation happens.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Business Impact')
    pdf.body(
        'Fewer stockouts on bestselling decors, less capital trapped in fading patterns, and '
        'purchasing decisions grounded in actual demand signals rather than instinct.'
    )

    # =========================================================================
    # PAGE 4: Module 3 + Module 4
    # =========================================================================
    pdf.add_page()

    pdf.module_title('3', 'Distributor Discount & Scheme Management')
    pdf.sub_heading('The Problem')
    pdf.body(
        'Laminate brands sell through multi-tier dealer and distributor networks, each with '
        'individually negotiated volume-based schemes and discount slabs. Tracked manually in '
        'spreadsheets, this is slow to reconcile and easy to get wrong - and a late or incorrect '
        'payout damages a relationship that took years to build.'
    )
    pdf.sub_heading('How InvenIQ Solves It')
    for f in [
        'A centralized discount engine maintains per-distributor pricing tiers, eligibility '
        'rules, scheme slabs and validity windows in one place.',
        'Full visibility into which schemes are currently active, which distributors qualify, '
        'and what is owed - replacing manual spreadsheet cross-checking entirely.',
        'Structured scheme management gives sales and finance teams the same numbers at the '
        'same time, eliminating the back-and-forth that normally happens at payout time.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Business Impact')
    pdf.body(
        'Faster, accurate scheme payouts build dealer loyalty and protect the distributor '
        'relationships the business depends on. The sales team spends its time selling, not '
        'reconciling spreadsheets.'
    )
    pdf.ln(2)

    pdf.module_title('4', 'AI Photo-to-Catalog Product Search')
    pdf.sub_heading('The Problem')
    pdf.body(
        'A customer walks in with an old sample, a competitor\'s sheet, or a photo from a '
        'magazine and asks "do you have this?" Manually flipping through a catalog of thousands '
        'of SKUs to find a match is slow, and often the sale is lost before the right product '
        'is found.'
    )
    pdf.sub_heading('How InvenIQ Solves It')
    for f in [
        'Built-in AI visual recognition matches a photographed sample against the full product '
        'catalog and returns the closest matching SKUs with specification and stock status.',
        'Multiple photos can be searched in a single batch - useful when a customer brings '
        'several samples or a whole board of swatches at once.',
        'This visual-matching capability is already proven in the platform\'s hardware and '
        'sanitary catalog today, and the same underlying AI technique applies directly to '
        'matching laminate decors and sample swatches.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Business Impact')
    pdf.body(
        'Sales staff identify the right product in seconds instead of minutes, at the counter '
        'or on a site visit - closing more sales before a customer walks away.'
    )

    # =========================================================================
    # PAGE 5: Module 5 + Summary
    # =========================================================================
    pdf.add_page()

    pdf.module_title('5', 'AI Business Assistant')
    pdf.sub_heading('The Problem')
    pdf.body(
        'Getting a straight answer about the business - which customers are overdue, what the '
        'current stock position is, where margin is being lost - usually means waiting for '
        'someone else to pull a report together.'
    )
    pdf.sub_heading('How InvenIQ Solves It')
    for f in [
        'A GPT-4o-powered assistant is built directly into the platform and understands live '
        'business data - ask it questions in plain English and get an instant, data-backed answer.',
        'It proactively surfaces problems on its own - stockouts, demand spikes, overdue '
        'payments - before anyone has to think to ask.',
        'It can take action directly from the conversation, such as drafting a purchase order, '
        'rather than just describing what should happen next.',
        'Responses stream back in real time, so the first answer appears in under two seconds.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Business Impact')
    pdf.body(
        'Every manager gets an analyst on demand, 24 hours a day, without waiting on someone '
        'else to build a report - decisions get made the same day the question comes up.'
    )
    pdf.ln(3)

    pdf.section_title('Why InvenIQ - At a Glance')
    pdf.table(
        [
            ('Dead stock locks up capital', 'Automatic dead-stock detection + AI Q&A', 'Free up cash before write-off'),
            ('Wrong decors in stock', 'AI demand forecasting', 'Stock what will actually sell'),
            ('Slow, error-prone dealer schemes', 'Centralized discount/scheme engine', 'Faster, accurate payouts'),
            ('Cannot match a sample to a SKU', 'AI photo-to-catalog search', 'Close sales in seconds, not minutes'),
            ('Reports always a week late', 'Conversational AI assistant', 'Answers on demand, 24/7'),
        ],
        col_widths=[58, 65, 57],
        header=('Problem', 'AI-Powered Solution', 'Business Outcome'),
    )

    pdf.ln(4)
    pdf.set_font('Helvetica', 'I', 9)
    pdf.set_text_color(90, 90, 90)
    pdf.set_x(14)
    pdf.multi_cell(182, 5.5, clean(
        'This brief covers 5 selected modules as a focused introduction. The full InvenIQ '
        'platform includes additional capabilities across procurement, quality control, '
        'finance, freight, customer claims, and more - available for a deeper walkthrough '
        'on request.'
    ))

    # =========================================================================
    # SAVE
    # =========================================================================
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'InvenIQ_Laminates_Industry_Brief.pdf')
    pdf.output(out_path)
    print('PDF saved: ' + out_path)


if __name__ == '__main__':
    build_pdf()
