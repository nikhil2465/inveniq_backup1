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
        .replace('—', ' - ')
        .replace('–', '-')
        .replace(u'’', "'")
    )


class SynopsisPDF(FPDF):

    def header(self):
        if self.page_no() == 1:
            return
        self.set_fill_color(13, 27, 62)
        self.rect(0, 0, 210, 16, 'F')
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(255, 255, 255)
        self.set_y(4)
        self.cell(0, 8, 'MCA Project Synopsis  |  JAIN Online University  |  2026', align='C')
        self.set_text_color(0, 0, 0)
        self.set_y(18)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-12)
        self.set_fill_color(13, 27, 62)
        self.rect(0, 285, 210, 12, 'F')
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(200, 200, 200)
        self.cell(0, 8,
            'Page %d  |  InvenIQ - AI-Integrated Inventory Intelligence Platform  |  Confidential'
            % self.page_no(),
            align='C')
        self.set_text_color(0, 0, 0)

    def section_title(self, title):
        self.ln(3)
        self.set_fill_color(13, 27, 62)
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(255, 255, 255)
        self.set_x(10)
        self.cell(190, 8, '  ' + clean(title), fill=True)
        self.set_fill_color(0, 140, 100)
        self.rect(10, self.get_y(), 190, 1.2, 'F')
        self.ln(10)
        self.set_text_color(0, 0, 0)

    def module_title(self, title):
        self.ln(2)
        self.set_fill_color(228, 244, 238)
        self.set_draw_color(0, 140, 100)
        self.set_line_width(0.5)
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(13, 27, 62)
        self.set_x(10)
        self.cell(190, 8, '  ' + clean(title), border='L', fill=True)
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

    def two_col_table(self, rows, col1_w=55, header=None):
        self.set_draw_color(180, 180, 180)
        self.set_line_width(0.2)
        col2_w = 186 - col1_w
        if header:
            self.set_fill_color(13, 27, 62)
            self.set_font('Helvetica', 'B', 9)
            self.set_text_color(255, 255, 255)
            self.set_x(12)
            self.cell(col1_w, 7, '  ' + clean(header[0]), border=1, fill=True)
            self.cell(col2_w, 7, '  ' + clean(header[1]), border=1, fill=True)
            self.ln(7)
        for i, (c1, c2) in enumerate(rows):
            fill = (i % 2 == 0)
            if fill:
                self.set_fill_color(243, 250, 246)
            else:
                self.set_fill_color(255, 255, 255)
            self.set_font('Helvetica', 'B', 9)
            self.set_text_color(13, 27, 62)
            self.set_x(12)
            self.cell(col1_w, 7, '  ' + clean(c1), border=1, fill=fill)
            self.set_font('Helvetica', '', 9)
            self.set_text_color(45, 45, 45)
            self.cell(col2_w, 7, '  ' + clean(c2), border=1, fill=fill)
            self.ln(7)
        self.ln(2)


def build_pdf():
    pdf = SynopsisPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(10, 20, 10)

    # =========================================================================
    # COVER PAGE
    # =========================================================================
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # Dark header band
    pdf.set_fill_color(13, 27, 62)
    pdf.rect(0, 0, 210, 50, 'F')
    pdf.set_fill_color(0, 140, 100)
    pdf.rect(0, 50, 210, 3, 'F')

    pdf.set_font('Helvetica', 'B', 22)
    pdf.set_text_color(255, 255, 255)
    pdf.set_y(14)
    pdf.cell(0, 12, 'InvenIQ', align='C')
    pdf.ln(12)
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(0, 210, 150)
    pdf.cell(0, 8, 'AI-Integrated Inventory Intelligence Platform', align='C')

    pdf.set_text_color(0, 0, 0)
    pdf.set_y(62)
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(90, 90, 90)
    pdf.cell(0, 8, 'JAIN Online University', align='C')
    pdf.ln(7)
    pdf.cell(0, 8, 'Master of Computer Applications (MCA)', align='C')
    pdf.ln(7)
    pdf.set_font('Helvetica', 'B', 10)
    pdf.set_text_color(13, 27, 62)
    pdf.cell(0, 8, 'Project Synopsis  -  Academic Year 2025-2026', align='C')

    pdf.set_y(100)
    pdf.set_draw_color(0, 140, 100)
    pdf.set_line_width(0.4)
    info = [
        ('Project Type',    'AI-Powered Full-Stack Web Application'),
        ('Tech Stack',      'React 18  +  FastAPI  +  MySQL  +  GPT-4o'),
        ('Modules Covered', '4 Core Modules (from a larger enterprise system)'),
        ('Submission Date', '8 June 2026'),
        ('Status',          'Ready for Academic Submission'),
    ]
    for label, value in info:
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(13, 27, 62)
        pdf.set_x(30)
        pdf.cell(52, 10, label + ':', border='B')
        pdf.set_font('Helvetica', '', 10)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(130, 10, value, border='B')
        pdf.ln(12)

    pdf.set_fill_color(0, 140, 100)
    pdf.rect(0, 262, 210, 2, 'F')
    pdf.set_fill_color(13, 27, 62)
    pdf.rect(0, 264, 210, 33, 'F')
    pdf.set_y(270)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(0, 210, 150)
    pdf.cell(0, 6, 'CONFIDENTIAL  -  FOR ACADEMIC EVALUATION ONLY', align='C')
    pdf.ln(7)
    pdf.set_font('Helvetica', 'I', 8)
    pdf.set_text_color(160, 160, 160)
    pdf.cell(0, 6,
        'This document contains selectively disclosed modules. Full system details are proprietary.',
        align='C')

    # Re-enable auto page break for all content pages
    pdf.set_auto_page_break(auto=True, margin=20)

    # =========================================================================
    # PAGE 2: Abstract, Problem Statement, Objectives, Tech Stack
    # =========================================================================
    pdf.add_page()

    pdf.section_title('Abstract')
    pdf.body(
        'Traditional inventory management systems suffer from reactive decision-making, '
        'fragmented data flows, and complete absence of predictive capability. This project '
        'presents InvenIQ, an enterprise-grade, AI-augmented inventory intelligence platform '
        'built on a modern full-stack architecture (React 18 + FastAPI + MySQL + GPT-4o). '
        'The system replaces spreadsheet-driven workflows with real-time dashboards, automated '
        'procurement pipelines, intelligent demand visibility, and a conversational AI business '
        'assistant - enabling businesses to make data-driven decisions with minimal manual '
        'intervention at every stage of their inventory lifecycle.'
    )

    pdf.section_title('Problem Statement')
    problems = [
        'No centralized real-time visibility into stock levels, inward movements, or outward dispatch.',
        'Purchase orders tracked manually in spreadsheets - prone to errors and costly delays.',
        'Sales data and customer records siloed across tools with no unified operational view.',
        'Zero forecasting capability leading to chronic overstocking or stockout situations.',
        'No actionable insight layer - management reports generated manually, often days late.',
    ]
    for p in problems:
        pdf.bullet(p)
    pdf.ln(2)

    pdf.section_title('Objectives')
    objectives = [
        '1.  Design a scalable full-stack web platform for end-to-end inventory lifecycle management.',
        '2.  Implement an automated procurement workflow: Purchase Requisition -> Purchase Order -> GRN.',
        '3.  Build a sales and customer management system with order tracking and credit monitoring.',
        '4.  Integrate GPT-4o as a conversational business intelligence engine with live data tools.',
        '5.  Deliver a production-grade, role-based, JWT-authenticated multi-user system.',
    ]
    for o in objectives:
        pdf.body(o, indent=14)
    pdf.ln(1)

    pdf.section_title('Technology Stack')
    stack = [
        ('Frontend',     'React 18, Chart.js, CSS3 token-based design system'),
        ('Backend',      'FastAPI (Python 3.11), asyncio, aiomysql'),
        ('Database',     'MySQL 8.0'),
        ('AI Engine',    'OpenAI GPT-4o via Async REST API'),
        ('Auth',         'JWT (access + refresh tokens), bcrypt password hashing'),
        ('Deployment',   'Localhost / VPS - environment-variable driven configuration'),
        ('Dev Tools',    'VS Code, Postman, Git'),
    ]
    pdf.two_col_table(stack, col1_w=48, header=('Layer', 'Technology'))

    # =========================================================================
    # PAGE 3: Module 1 + Module 2
    # =========================================================================
    pdf.add_page()
    pdf.section_title('Project Scope  -  4 Selected Modules')

    pdf.module_title('Module 1  -  Inventory Management & Stock Tracking')
    pdf.sub_heading('Purpose')
    pdf.body(
        'Provides real-time visibility into current stock, inward receipts, '
        'movement history, and dead-stock identification across all SKUs.'
    )
    pdf.sub_heading('Key Features')
    for f in [
        'SKU-level stock ledger with movement type classification: GRN Receipt, Sale Dispatch, Purchase Return, Damage Write-off.',
        'Inward register - records every goods receipt against a supplier with quantity, batch, and date.',
        'Dead-stock detection engine - flags SKUs with zero movement beyond a configurable threshold (default: 90 days).',
        'KPI dashboard: Total SKUs | Total Stock Value | Items Below Reorder | Dead-Stock Count.',
        'Period-based filtering (Today / MTD / QTD / YTD) with CSV export for reconciliation.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Technical Highlights')
    for t in [
        'Async FastAPI endpoint using asyncio.gather() for parallel database queries.',
        'DB-first / demo-fallback pattern - system remains fully functional without MySQL.',
        'Chart.js area chart rendering stock movement trend over rolling periods.',
    ]:
        pdf.bullet(t)
    pdf.sub_heading('Academic Relevance')
    pdf.body(
        'Database normalization, indexed query optimization, React state management, '
        'and REST API design principles (resource-based routing, proper HTTP status codes, pagination).'
    )
    pdf.ln(2)

    pdf.module_title('Module 2  -  Procurement Management  (PR -> PO -> GRN)')
    pdf.sub_heading('Purpose')
    pdf.body(
        'End-to-end procure-to-pay workflow from internal material requests through '
        'vendor ordering to goods receipt and quality verification.'
    )
    pdf.sub_heading('Key Features')
    for f in [
        'Purchase Requisition: Department-wise requests with priority levels (CRITICAL / HIGH / MEDIUM / LOW); '
        'status lifecycle PENDING -> APPROVED -> CONVERTED; inline edit and duplicate capability.',
        'Purchase Order: PR-to-PO conversion with supplier selection; conflict prevention (one DRAFT PO per '
        'supplier per PR); auto-progression DRAFT -> PARTIAL -> RECEIVED -> FULLY_RECEIVED.',
        'Goods Receipt Note (GRN): Quantity verification against PO line items; over-receiving prevention '
        '(422 error); journal entry auto-generated (DR Stock / CR Accounts Payable).',
        'Quality Control: 4-quantity decision form per line (Accepted / Rejected / Rework / Hold); '
        'QC completion gate enforced before invoice matching proceeds.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Technical Highlights')
    for t in [
        'Multi-table transactional writes with rollback safety using aiomysql.',
        'Status machine validation at API layer - business rules enforced server-side.',
        'Audit log service records every status change with user identity and timestamp.',
        'Idempotent schema migrations executed automatically on application boot.',
    ]:
        pdf.bullet(t)
    pdf.sub_heading('Academic Relevance')
    pdf.body(
        'Enterprise workflow state machines, transactional database integrity, '
        'service-layer architecture, and audit trail design patterns.'
    )

    # =========================================================================
    # PAGE 4: Module 3 + Module 4
    # =========================================================================
    pdf.add_page()

    pdf.module_title('Module 3  -  Sales & Customer Management')
    pdf.sub_heading('Purpose')
    pdf.body(
        'Centralized tracking of customer accounts, sales orders, '
        'and outstanding credit positions across the entire business.'
    )
    pdf.sub_heading('Key Features')
    for f in [
        'Customer master with contact details, GST number, city, and account status.',
        'Sales order register at line-item level: product, quantity, rate, and dispatch status.',
        'Outstanding order dashboard - pending vs. dispatched vs. invoiced breakdown.',
        'Customer-level credit exposure view: credit limit, utilized amount, overdue flag.',
        'Sales trend chart - monthly revenue over rolling 12 months (Chart.js gradient-fill line chart).',
        'Server-side paginated API for scalable table rendering across large datasets.',
        'Period selector (Today / MTD / QTD / YTD) propagated across all data-fetching views.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Technical Highlights')
    for t in [
        'Paginated API endpoint (limit / offset) preventing full-table scans on large datasets.',
        'React state coordination between search filter and pagination components simultaneously.',
        'Silent background auto-refresh on window focus without disrupting the user experience.',
    ]:
        pdf.bullet(t)
    pdf.sub_heading('Academic Relevance')
    pdf.body(
        'Pagination design trade-offs (client-side vs. server-side), component-level state '
        'isolation in React, and relational data modeling for CRM-adjacent business systems.'
    )
    pdf.ln(2)

    pdf.module_title('Module 4  -  AI-Powered Business Intelligence Assistant')
    pdf.sub_heading('Purpose')
    pdf.body(
        'A conversational GPT-4o assistant embedded in the platform that answers operational '
        'queries, generates proactive insights, and surfaces actionable intelligence from live '
        'business data - replacing manual report generation entirely.'
    )
    pdf.sub_heading('4-Path Intelligent Routing Architecture')
    pdf.two_col_table([
        ('Path 1', 'Generic / greeting queries  ->  direct conversational response'),
        ('Path 2', 'Knowledge queries  ->  structured KB (inventory, GST, procurement rules)'),
        ('Path 3', 'Insight queries  ->  full-platform data aggregation  ->  proactive KPI analysis'),
        ('Path 4', 'Operational queries  ->  tool selector  ->  live DB fetch  ->  GPT-4o response'),
    ], col1_w=30, header=('Path', 'Routing Behavior'))

    pdf.sub_heading('Key Features')
    for f in [
        'Natural language query interface with streaming token output via SSE (Server-Sent Events).',
        'Live data tools covering stock levels, demand trends, supplier performance, customer outstanding.',
        'Proactive anomaly detection: stockouts, demand spikes, overdue payments without user prompting.',
        'Root-cause analysis templates (PDCA / 5-Why / Fishbone) auto-applied to operational issues.',
        'Create Purchase Order via chat using GPT-4o function calling -> confirmation card -> DB write.',
    ]:
        pdf.bullet(f)
    pdf.sub_heading('Technical Highlights')
    for t in [
        'OpenAI AsyncOpenAI client with 60-second timeout and graceful API failure degradation.',
        'SSE streaming delivers first token in under 1.5 seconds for perceived performance.',
        'Client disconnect detection stops LLM generation on tab close (eliminates wasted API cost).',
        'asyncio.gather() runs all data tools in parallel during insight generation.',
    ]:
        pdf.bullet(t)
    pdf.sub_heading('Academic Relevance')
    pdf.body(
        'LLM integration architecture, SSE streaming protocols, tool-use / function calling, '
        'multi-path AI routing design, and safety-first fallback pattern implementation.'
    )

    # =========================================================================
    # PAGE 5: Architecture, Auth, Outcomes, Limitations, References
    # =========================================================================
    pdf.add_page()

    pdf.section_title('System Architecture')
    pdf.set_font('Courier', '', 8.5)
    pdf.set_fill_color(245, 248, 252)
    pdf.set_draw_color(200, 210, 220)
    pdf.set_line_width(0.3)
    pdf.rect(10, pdf.get_y() - 1, 190, 92, 'FD')
    pdf.set_text_color(13, 27, 62)
    for line in [
        '  +----------------------------------------------------------+',
        '  |                    React 18 SPA                          |',
        '  |   Inventory | Procurement | Sales | AI Assistant         |',
        '  |         JWT Auth  +  Silent Token Refresh                |',
        '  +----------------------------+-----------------------------+',
        '                               |  HTTP / SSE  (/api/*)',
        '  +----------------------------v-----------------------------+',
        '  |                 FastAPI Backend                          |',
        '  |  GZip Middleware -> Auth Middleware -> Role Check        |',
        '  |     dashboard  |  po_grn  |  analytics  |  chat         |',
        '  +--------------+-----------------------+------------------+',
        '                  |                       |',
        '        +---------v---------+   +---------v---------+',
        '        |    MySQL 8.0      |   |   GPT-4o API       |',
        '        |    (aiomysql)     |   |   (OpenAI)         |',
        '        +-------------------+   +-------------------+',
    ]:
        pdf.set_x(14)
        pdf.cell(0, 5.5, line)
        pdf.ln(5.5)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    pdf.section_title('Authentication & Role-Based Access Control')
    pdf.two_col_table([
        ('Access Token',     'JWT, 8-hour expiry, signed with HS256'),
        ('Refresh Token',    '7-day expiry, DB-backed rotation on each use'),
        ('Password Hashing', 'bcrypt with salt rounds'),
        ('Role Hierarchy',   'Admin > Sales Manager > Warehouse Manager > CFO'),
        ('Module Access',    'Enforced at API middleware layer per JWT claim'),
        ('Public Routes',    '/api/health  and  /api/auth/*  only'),
    ], col1_w=50, header=('Feature', 'Detail'))

    pdf.section_title('Expected Outcomes')
    pdf.two_col_table([
        ('Stock Visibility',       'Real-time SKU-level ledger with full movement history'),
        ('Procurement Automation', 'PR to GRN completed in under 3 screen interactions'),
        ('Sales Tracking',         'Order-level dispatch and outstanding visibility'),
        ('AI Response Latency',    'First streaming token delivered in under 1.5 seconds'),
        ('Offline Demo Mode',      'Fully functional without any database connection'),
    ], col1_w=55, header=('Outcome', 'Target Metric'))

    pdf.section_title('Limitations  (Academic Scope)')
    for l in [
        'Multi-warehouse distributed inventory is not in scope for this phase.',
        'Payment gateway integration is not included.',
        'Mobile application is out of scope - responsive web interface only.',
        'ERP integration (SAP, Tally) is not covered in this submission.',
    ]:
        pdf.bullet(l)
    pdf.ln(2)

    pdf.section_title('References')
    for r in [
        '1.  FastAPI Official Documentation          https://fastapi.tiangolo.com',
        '2.  React 18 Documentation                  https://react.dev',
        '3.  OpenAI API Reference                    https://platform.openai.com/docs',
        '4.  MySQL 8.0 Reference Manual              https://dev.mysql.com/doc',
        '5.  OWASP Top 10 Web Application Risks      https://owasp.org',
        '6.  JSON Web Tokens RFC 7519                https://tools.ietf.org/html/rfc7519',
        '7.  Chart.js Documentation                  https://www.chartjs.org/docs',
        '8.  aiomysql Documentation                  https://aiomysql.readthedocs.io',
    ]:
        pdf.body(r, indent=14)

    # =========================================================================
    # SAVE
    # =========================================================================
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'MCA_Synopsis_InvenIQ.pdf')
    pdf.output(out_path)
    print('PDF saved: ' + out_path)


if __name__ == '__main__':
    build_pdf()
