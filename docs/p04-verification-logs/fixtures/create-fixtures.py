from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw
root=Path('/Users/bytedance/Desktop/work/code/value-investing-corner/docs/p04-verification-logs/fixtures')
doc=pymupdf.open()
for i in range(2):
    page=doc.new_page(width=595,height=842)
    page.insert_text((50,80),f'P04 fictional research fixture - Page {i+1}',fontsize=18)
    page.insert_text((50,120),'Not actual company evidence. Local preview verification only.',fontsize=12)
    page.draw_rect(pymupdf.Rect(50,160,545,280),color=(0.1,0.3,0.2))
    page.insert_text((70,200),f'Local PDF page {i+1}: content preserved.',fontsize=14)
doc.save(root/'sample.pdf');doc.close()
image=Image.new('RGB',(720,400),'#dce8df');draw=ImageDraw.Draw(image);draw.text((50,160),'P04 fictional local image fixture',fill='#17251d',font_size=26);image.save(root/'sample.png')
(root/'sample.md').write_text('# P04虚构资料\n\n本地预览验收，不是真实公司证据。\n\n- 原件移动后复制件仍可读。\n',encoding='utf-8')
(root/'sample.csv').write_text('名称,代码,备注\n甲,00123,\n乙,00999,"包含逗号,原样保留"\n',encoding='utf-8')
print('created 4 fictional fixtures')
