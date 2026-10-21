import sys, zipfile, random
sys.path.insert(0,'tools')
from make_fixtures import *
def build_big(path, n=3000):
    random.seed(1)
    shapes=''
    cols=60
    for i in range(n):
        x=1+ (i%cols)*0.9; y=1+(i//cols)*0.7
        shapes+=shape(i+1, cell('PinX',x)+cell('PinY',y)+cell('Width',0.7)+cell('Height',0.45)+cell('LocPinX',0.35)+cell('LocPinY',0.225)+cell('FillForegnd','#%06X'%random.randint(0x909090,0xFFFFFF)), rect_geo(0.7,0.45)+f'<Text><cp IX="0"/>{i}</Text>', attrs='LineStyle="0" FillStyle="0" TextStyle="0"')
    files={}
    files['[Content_Types].xml']=HDR+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'
    files['_rels/.rels']=HDR+f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/></Relationships>'
    files['visio/document.xml']=HDR+f'<VisioDocument xmlns="{NS}" xmlns:r="{NSR}"><StyleSheets><StyleSheet ID="0" NameU="No Style">'+cell('LineWeight',0.0104)+cell('LineColor',0)+cell('LinePattern',1)+cell('FillForegnd',1)+cell('FillPattern',1)+'</StyleSheet></StyleSheets></VisioDocument>'
    files['visio/_rels/document.xml.rels']=HDR+f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/></Relationships>'
    files['visio/pages/pages.xml']=HDR+f'<Pages xmlns="{NS}" xmlns:r="{NSR}"><Page ID="0" Name="Büyük"><PageSheet>{cell("PageWidth",56)}{cell("PageHeight",40)}</PageSheet><Rel r:id="rId1"/></Page></Pages>'
    files['visio/pages/_rels/pages.xml.rels']=HDR+f'<Relationships xmlns="{REL}"><Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/></Relationships>'
    files['visio/pages/page1.xml']=HDR+f'<PageContents xmlns="{NS}" xmlns:r="{NSR}"><Shapes>{shapes}</Shapes></PageContents>'
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',files.pop('[Content_Types].xml'))
        for k,v in files.items(): z.writestr(k,v)
build_big(sys.argv[1], int(sys.argv[2]) if len(sys.argv)>2 else 3000)
