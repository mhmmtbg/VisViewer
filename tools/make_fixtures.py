#!/usr/bin/env python3
"""Test için gerçek Visio yapısını taklit eden örnek .vsdx dosyaları üretir
(master mirası, stil sayfaları, grup, yaylar, NURBS, resim, katman, arka plan sayfası, bağlayıcılar)."""
import struct
import sys
import zlib
import zipfile

NS = 'http://schemas.microsoft.com/office/visio/2012/main'
NSR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
HDR = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n'


def png(w=16, h=16):
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes([220 if (x // 4 + y // 4) % 2 == 0 else 40, 90, 160 if x > w // 2 else 40])
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


def cell(n, v, f=None):
    return f'<Cell N="{n}" V="{v}"' + (f' F="{f}"' if f else '') + '/>'


def row(t, ix, cells):
    return f'<Row T="{t}" IX="{ix}">' + ''.join(cell(*c) for c in cells) + '</Row>'


def rect_geo(w, h, ix=0):
    return (f'<Section N="Geometry" IX="{ix}">' + cell('NoFill', 0) + cell('NoLine', 0) +
            row('MoveTo', 1, [('X', 0, 'Width*0'), ('Y', 0, 'Height*0')]) +
            row('LineTo', 2, [('X', w, 'Width*1'), ('Y', 0, 'Height*0')]) +
            row('LineTo', 3, [('X', w, 'Width*1'), ('Y', h, 'Height*1')]) +
            row('LineTo', 4, [('X', 0, 'Width*0'), ('Y', h, 'Height*1')]) +
            row('LineTo', 5, [('X', 0, 'Width*0'), ('Y', 0, 'Height*0')]) + '</Section>')


def diamond_geo(w, h):
    return ('<Section N="Geometry" IX="0">' + cell('NoFill', 0) + cell('NoLine', 0) +
            row('MoveTo', 1, [('X', 0, 'Width*0'), ('Y', h / 2, 'Height*0.5')]) +
            row('LineTo', 2, [('X', w / 2, 'Width*0.5'), ('Y', h, 'Height*1')]) +
            row('LineTo', 3, [('X', w, 'Width*1'), ('Y', h / 2, 'Height*0.5')]) +
            row('LineTo', 4, [('X', w / 2, 'Width*0.5'), ('Y', 0, 'Height*0')]) +
            row('LineTo', 5, [('X', 0, 'Width*0'), ('Y', h / 2, 'Height*0.5')]) + '</Section>')


def terminator_geo(w, h):
    # iki yarım daire (ArcTo) + düz kenarlar; r = h/2
    r = h / 2
    return ('<Section N="Geometry" IX="0">' + cell('NoFill', 0) + cell('NoLine', 0) +
            row('MoveTo', 1, [('X', r, 'Height*0.5'), ('Y', 0, 'Height*0')]) +
            row('LineTo', 2, [('X', w - r, 'Width-Height*0.5'), ('Y', 0, 'Height*0')]) +
            row('ArcTo', 3, [('X', w - r, 'Width-Height*0.5'), ('Y', h, 'Height*1'), ('A', r, 'Height*0.5')]) +
            row('LineTo', 4, [('X', r, 'Height*0.5'), ('Y', h, 'Height*1')]) +
            row('ArcTo', 5, [('X', r, 'Height*0.5'), ('Y', 0, 'Height*0'), ('A', r, 'Height*0.5')]) + '</Section>')


def shape(sid, cells='', body='', typ='Shape', attrs=''):
    return f'<Shape ID="{sid}" Type="{typ}" {attrs}>{cells}{body}</Shape>'


def build(path):
    files = {}
    files['[Content_Types].xml'] = HDR + (
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
        '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>'
        '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>'
        '<Override PartName="/visio/masters/masters.xml" ContentType="application/vnd.ms-visio.masters+xml"/>'
        '</Types>')
    files['_rels/.rels'] = HDR + f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/></Relationships>'
    files['visio/document.xml'] = HDR + (
        f'<VisioDocument xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve">'
        '<Colors><ColorEntry IX="24" RGB="#2F5597"/><ColorEntry IX="25" RGB="#FFE699"/></Colors>'
        '<FaceNames><FaceName ID="0" Name="Calibri"/><FaceName ID="1" Name="Arial"/></FaceNames>'
        '<StyleSheets>'
        '<StyleSheet ID="0" NameU="No Style" LineStyle="0" FillStyle="0" TextStyle="0">' + cell('LineWeight', 0.0104166) + cell('LineColor', 0) + cell('LinePattern', 1) + cell('FillForegnd', 1) + cell('FillBkgnd', 0) + cell('FillPattern', 1) +
        cell('LeftMargin', 0.0555) + cell('RightMargin', 0.0555) + cell('TopMargin', 0.0555) + cell('BottomMargin', 0.0555) + cell('VerticalAlign', 1) +
        '<Section N="Character"><Row IX="0">' + cell('Font', 0) + cell('Color', 0) + cell('Size', 0.1667) + '</Row></Section><Section N="Paragraph"><Row IX="0">' + cell('HorzAlign', 1) + '</Row></Section></StyleSheet>'
        '<StyleSheet ID="1" NameU="Blue Box" LineStyle="0" FillStyle="0" TextStyle="0">' + cell('LineColor', 24) + cell('LineWeight', 0.02) + cell('FillForegnd', '#DDEBF7') + '</StyleSheet>'
        '<StyleSheet ID="2" NameU="Gold" LineStyle="1" FillStyle="1" TextStyle="0">' + cell('FillForegnd', 25) + '</StyleSheet>'
        '</StyleSheets></VisioDocument>')
    files['visio/_rels/document.xml.rels'] = HDR + f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/masters" Target="masters/masters.xml"/></Relationships>'

    # ---- masterlar ----
    files['visio/masters/masters.xml'] = HDR + (
        f'<Masters xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve">'
        f'<Master ID="2" NameU="Process" Name="İşlem"><PageSheet>{cell("PageWidth", 1.5)}{cell("PageHeight", 1)}</PageSheet><Rel r:id="rId1"/></Master>'
        f'<Master ID="3" NameU="Decision" Name="Karar"><PageSheet>{cell("PageWidth", 1.5)}{cell("PageHeight", 1)}</PageSheet><Rel r:id="rId2"/></Master>'
        f'<Master ID="4" NameU="Terminator" Name="Başla/Bitir"><PageSheet>{cell("PageWidth", 1.5)}{cell("PageHeight", 0.75)}</PageSheet><Rel r:id="rId3"/></Master>'
        f'<Master ID="5" NameU="Server" Name="Sunucu"><PageSheet>{cell("PageWidth", 1)}{cell("PageHeight", 1.4)}</PageSheet><Rel r:id="rId4"/></Master>'
        '</Masters>')
    files['visio/masters/_rels/masters.xml.rels'] = HDR + f'<Relationships xmlns="{REL}">' + ''.join(
        f'<Relationship Id="rId{i}" Type="http://schemas.microsoft.com/visio/2010/relationships/master" Target="master{i}.xml"/>' for i in range(1, 5)) + '</Relationships>'

    def master(shapes):
        return HDR + f'<MasterContents xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve"><Shapes>{shapes}</Shapes></MasterContents>'
    base = lambda w, h: cell('PinX', w / 2, 'Width*0.5') + cell('PinY', h / 2, 'Height*0.5') + cell('Width', w) + cell('Height', h) + cell('LocPinX', w / 2, 'Width*0.5') + cell('LocPinY', h / 2, 'Height*0.5') + cell('Angle', 0)
    files['visio/masters/master1.xml'] = master(shape(1, base(1.5, 1) + cell('LineColor', 24) + cell('LineWeight', 0.02) + cell('FillForegnd', '#FFFFFF') + cell('Rounding', 0.08), rect_geo(1.5, 1) + '<Text><cp IX="0"/>Süreç</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"'))
    files['visio/masters/master2.xml'] = master(shape(1, base(1.5, 1) + cell('LineColor', 24) + cell('FillForegnd', 25), diamond_geo(1.5, 1), attrs='LineStyle="0" FillStyle="0" TextStyle="0"'))
    files['visio/masters/master3.xml'] = master(shape(1, base(1.5, 0.75) + cell('LineColor', 24) + cell('FillForegnd', '#E2F0D9'), terminator_geo(1.5, 0.75), attrs='LineStyle="0" FillStyle="0" TextStyle="0"'))
    # grup master: gövde + iki bölme
    files['visio/masters/master4.xml'] = master(shape(1, base(1, 1.4) + cell('LineColor', 24), '', typ='Group', attrs='LineStyle="0" FillStyle="0" TextStyle="0"').replace('</Shape>',
        '<Shapes>' +
        shape(2, cell('PinX', 0.5, 'Sheet.1!Width*0.5') + cell('PinY', 0.7, 'Sheet.1!Height*0.5') + cell('Width', 1, 'Sheet.1!Width*1') + cell('Height', 1.4, 'Sheet.1!Height*1') + cell('LocPinX', 0.5, 'Width*0.5') + cell('LocPinY', 0.7, 'Height*0.5') + cell('FillForegnd', '#D9D9D9') + cell('LineColor', 24), rect_geo(1, 1.4), attrs='LineStyle="0" FillStyle="0" TextStyle="0"') +
        shape(3, cell('PinX', 0.5, 'Sheet.1!Width*0.5') + cell('PinY', 1.05, 'Sheet.1!Height*0.75') + cell('Width', 0.8, 'Sheet.1!Width*0.8') + cell('Height', 0.25, 'Sheet.1!Height*0.1786') + cell('LocPinX', 0.4, 'Width*0.5') + cell('LocPinY', 0.125, 'Height*0.5') + cell('FillForegnd', '#7F7F7F'), rect_geo(0.8, 0.25), attrs='LineStyle="0" FillStyle="0" TextStyle="0"') +
        '</Shapes></Shape>'))

    # ---- sayfalar ----
    files['visio/pages/pages.xml'] = HDR + (
        f'<Pages xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve">'
        f'<Page ID="0" NameU="Sayfa-1" Name="Sayfa-1" BackPage="2"><PageSheet>{cell("PageWidth", 11)}{cell("PageHeight", 8.5)}'
        '<Section N="Layer"><Row IX="0">' + cell('Name', 'Ağ') + cell('Visible', 1) + '</Row><Row IX="1">' + cell('Name', 'Notlar') + cell('Visible', 1) + '</Row></Section>'
        '</PageSheet><Rel r:id="rId1"/></Page>'
        f'<Page ID="2" NameU="Zemin" Name="Zemin" Background="1"><PageSheet>{cell("PageWidth", 11)}{cell("PageHeight", 8.5)}</PageSheet><Rel r:id="rId2"/></Page>'
        '</Pages>')
    files['visio/pages/_rels/pages.xml.rels'] = HDR + f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/><Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page2.xml"/></Relationships>'
    files['visio/pages/_rels/page1.xml.rels'] = HDR + f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'
    files['visio/media/image1.png'] = png()

    inst = lambda sid, master, x, y, w, h, text='', extra='': shape(sid,
        cell('PinX', x) + cell('PinY', y) + cell('Width', w) + cell('Height', h) + cell('LocPinX', w / 2, 'Inh') + cell('LocPinY', h / 2, 'Inh') + extra,
        (f'<Text><cp IX="0"/>{text}</Text>' if text else ''), attrs=f'Master="{master}"')

    shapes = ''
    # 1: işlem master'ı genişletilmiş (formül mirası), yuvarlak köşe
    shapes += inst(1, 2, 2.2, 7, 2.6, 0.9, 'Master örneği (2.6×0.9)')
    # 2: karar
    shapes += inst(2, 3, 2.2, 5.3, 2.4, 1.3, 'Karar ?')
    # 3: terminator (ArcTo)
    shapes += inst(3, 4, 5.8, 7, 2.2, 0.8, 'Başla')
    # 4: grup master örneği (alt şekiller MasterShape ile)
    shapes += shape(4, cell('PinX', 8.8) + cell('PinY', 5.6) + cell('Width', 1.5) + cell('Height', 2.1) + cell('LocPinX', 0.75) + cell('LocPinY', 1.05),
                    '<Shapes>' +
                    shape(5, cell('PinX', 0.75) + cell('PinY', 1.05) + cell('Width', 1.5) + cell('Height', 2.1) + cell('LocPinX', 0.75) + cell('LocPinY', 1.05), '', attrs='MasterShape="2"') +
                    shape(6, cell('PinX', 0.75) + cell('PinY', 1.575) + cell('Width', 1.2) + cell('Height', 0.375) + cell('LocPinX', 0.6) + cell('LocPinY', 0.1875), '<Text><cp IX="0"/>sunucu</Text>', attrs='MasterShape="3"') +
                    '</Shapes>', typ='Group', attrs='Master="5"')
    # 7: elle çizilmiş elips yayı (EllipticalArcTo) ve NURBS dalga
    shapes += shape(7, cell('PinX', 5.5) + cell('PinY', 5) + cell('Width', 2) + cell('Height', 1.2) + cell('LocPinX', 1) + cell('LocPinY', 0.6) + cell('FillForegnd', '#FCE4D6') + cell('LineColor', 2),
                    '<Section N="Geometry" IX="0">' + cell('NoFill', 0) +
                    row('MoveTo', 1, [('X', 0), ('Y', 0.6)]) +
                    row('LineTo', 2, [('X', 0), ('Y', 1.2)]) + row('LineTo', 3, [('X', 2), ('Y', 1.2)]) + row('LineTo', 4, [('X', 2), ('Y', 0.25)]) +
                    '<Row T="NURBSTo" IX="5">' + cell('X', 0) + cell('Y', 0.25) + cell('A', 0.5) + cell('B', 1) + cell('C', 0) + cell('D', 1) +
                    '<Cell N="E" V="0" F="NURBS(1,3,0,0,1.3,0.05,0.3,1,0.7,0.45,0.6,1,0,0.25,1,1)"/></Row>' +
                    row('LineTo', 6, [('X', 0), ('Y', 0.6)]) + '</Section>' +
                    '<Text><cp IX="0"/>NURBS dalga</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    # 8: döndürülmüş + aynalı şekil
    shapes += shape(8, cell('PinX', 3) + cell('PinY', 2.6) + cell('Width', 2) + cell('Height', 0.8) + cell('LocPinX', 1) + cell('LocPinY', 0.4) + cell('Angle', 0.5236) + cell('FlipX', 1) + cell('FillForegnd', 25) + cell('LineColor', 24) + cell('LineWeight', 0.03),
                    '<Section N="Geometry" IX="0">' + cell('NoFill', 0) +
                    row('MoveTo', 1, [('X', 0), ('Y', 0)]) + row('LineTo', 2, [('X', 2), ('Y', 0)]) + row('LineTo', 3, [('X', 2.5), ('Y', 0.4)]) + row('LineTo', 4, [('X', 2), ('Y', 0.8)]) + row('LineTo', 5, [('X', 0), ('Y', 0.8)]) + row('LineTo', 6, [('X', 0), ('Y', 0)]) + '</Section>' +
                    '<Text><cp IX="0"/>Dönük + aynalı</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    # 9: resim (Foreign)
    shapes += shape(9, cell('PinX', 8.8) + cell('PinY', 2.6) + cell('Width', 1.6) + cell('Height', 1.6) + cell('LocPinX', 0.8) + cell('LocPinY', 0.8),
                    '<ForeignData ForeignType="Bitmap" CompressionType="PNG"><Rel r:id="rId1" xmlns:r="' + NSR + '"/></ForeignData>', typ='Foreign')
    # 10: stil sayfası kullanan şekil (FillStyle=2 -> Gold; LineStyle=1 -> Blue Box)
    shapes += shape(10, cell('PinX', 5.5) + cell('PinY', 3.2) + cell('Width', 2) + cell('Height', 0.8) + cell('LocPinX', 1) + cell('LocPinY', 0.4),
                    rect_geo(2, 0.8) + '<Section N="Property"><Row N="Maliyet">' + cell('Label', 'Maliyet') + cell('Value', 125) + cell('Type', 2) + '</Row><Row N="Sahip">' + cell('Label', 'Sahip') + cell('Value', 'Muhammet') + cell('Type', 0) + '</Row></Section>' +
                    '<Text><cp IX="0"/>Stil: Gold + Blue Box</Text>', attrs='LineStyle="1" FillStyle="2" TextStyle="0"')
    # 11: Notlar katmanında şekil (LayerMember=1)
    shapes += shape(11, cell('PinX', 2.2) + cell('PinY', 1) + cell('Width', 3) + cell('Height', 0.6) + cell('LocPinX', 1.5) + cell('LocPinY', 0.3) + cell('LayerMember', '1') + cell('FillForegnd', '#FFF2CC'),
                    rect_geo(3, 0.6) + '<Text><cp IX="0"/>Notlar katmanı</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    # 12: dik bağlayıcı 1 -> 2 (Connects ile)
    conn = shape(12, cell('PinX', 2.2) + cell('PinY', 6.55) + cell('Width', 0.0) + cell('Height', 0) + cell('LocPinX', 0) + cell('LocPinY', 0) + cell('Angle', -1.5708) +
                 cell('BeginX', 2.2) + cell('BeginY', 6.55) + cell('EndX', 2.2) + cell('EndY', 5.95) + cell('EndArrow', 13) + cell('OneD', 1) + cell('LineWeight', 0.0139) + cell('FillPattern', 0),
                 '<Section N="Geometry" IX="0">' + cell('NoFill', 1) + row('MoveTo', 1, [('X', 0), ('Y', 0)]) + row('LineTo', 2, [('X', 0.6), ('Y', 0)]) + '</Section>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    shapes += conn
    # 13: elle metin (Karakter bölümü, Arial, kalın+italik, sola yaslı)
    shapes += shape(13, cell('PinX', 5.5) + cell('PinY', 1.2) + cell('Width', 3) + cell('Height', 0.9) + cell('LocPinX', 1.5) + cell('LocPinY', 0.45) + cell('FillPattern', 0) + cell('LinePattern', 0),
                    rect_geo(3, 0.9) + '<Section N="Character"><Row IX="0">' + cell('Font', 1) + cell('Color', '#C00000') + cell('Size', 0.2222) + cell('Style', 3) + '</Row></Section>'
                    '<Section N="Paragraph"><Row IX="0">' + cell('HorzAlign', 0) + '</Row></Section>' +
                    '<Text><cp IX="0"/>Arial kalın italik, sola yaslı; bu uzun satır sarılmalı ve kutuya sığmalıdır.</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    files['visio/pages/page1.xml'] = HDR + f'<PageContents xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve"><Shapes>{shapes}</Shapes><Connects>' + \
        '<Connect FromSheet="12" FromCell="BeginX" FromPart="9" ToSheet="1" ToCell="PinX" ToPart="3"/><Connect FromSheet="12" FromCell="EndX" FromPart="12" ToSheet="2" ToCell="PinX" ToPart="3"/></Connects></PageContents>'
    # arka plan sayfası
    files['visio/pages/page2.xml'] = HDR + f'<PageContents xmlns="{NS}" xmlns:r="{NSR}" xml:space="preserve"><Shapes>' + shape(1, cell('PinX', 5.5) + cell('PinY', 4.25) + cell('Width', 10.6) + cell('Height', 8.1) + cell('LocPinX', 5.3) + cell('LocPinY', 4.05) + cell('FillPattern', 0) + cell('LineColor', '#BFBFBF') + cell('LinePattern', 2),
                                                                                                            rect_geo(10.6, 8.1), attrs='LineStyle="0" FillStyle="0" TextStyle="0"') + '</Shapes></PageContents>'

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
        for k, v in files.items():
            z.writestr(k, v)
    print('yazıldı:', path)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'samples/masters.vsdx')
