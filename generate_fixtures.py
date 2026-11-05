"""Generate abstract geometric fixtures, never anatomical or patient images."""
import struct, math, json, hashlib, base64, pathlib, re
ROOT=pathlib.Path(__file__).parent
TS='1.2.840.10008.1.2.1'; MR='1.2.840.10008.5.1.4.1.1.4'
def el(g,e,vr,v):
    b=struct.pack('<H',v) if vr=='US' else v if isinstance(v,bytes) else str(v).encode('ascii')
    if len(b)%2:b+=b'\0' if vr=='UI' else b' '
    return struct.pack('<HH',g,e)+vr.encode()+(b'\0\0'+struct.pack('<I',len(b)) if vr in ('OB','OW','SQ','UN','UT') else struct.pack('<H',len(b)))+b

def fixture(s,z,change=None,omit=None):
    uid=f'2.25.700.{s}.{z+1}'; series=f'2.25.700.{s}'
    pixels=[]
    for y in range(96):
        for x in range(96):
            r=math.hypot(x-48,y-48)
            value=100+int(200*(x+y)/190)+ (1500 if abs(r-(15+z*3))<2 else 0)+(900 if (x+z*5)//12%2 and 15<y<30 else 0)+(500 if abs(x-y-s*6)<2 else 0)
            pixels.append(value)
    d={(2,2):('UI',MR),(2,3):('UI',uid),(2,16):('UI',TS),(8,22):('UI',MR),(8,24):('UI',uid),(8,96):('CS','MR'),(32,13):('UI','2.25.700'),(32,14):('UI',series),(32,52):('UI','2.25.701'),(32,50):('DS',f'0\\0\\{z*2}'),(32,55):('DS','1\\0\\0\\0\\1\\0'),(40,2):('US',1),(40,4):('CS','MONOCHROME2'),(40,16):('US',96),(40,17):('US',96),(40,48):('DS','1\\1'),(40,256):('US',16),(40,257):('US',16),(40,258):('US',15),(40,259):('US',0),(40,4178):('DS','-10'),(40,4179):('DS','2'),(32736,16):('OW',struct.pack('<9216H',*pixels))}
    d.update(change or {})
    for t in omit or []:d.pop(t,None)
    return b'\0'*128+b'DICM'+b''.join(el(*k,*v) for k,v in sorted(d.items()))

def item(name,b):return dict(name=name,base64=base64.b64encode(b).decode(),sha256=hashlib.sha256(b).hexdigest())
healthy=[item(f'abstract_series{s}_slice{z+1}.dcm',fixture(s,z)) for s in (1,2) for z in (4,1,3,0,2)]
report=item('synthetic_readme.txt',b'SYNTHETIC DEMONSTRATION ONLY. Abstract geometric test pixels, not anatomy. No clinical findings, no patient information. This text is a provenance note, not a radiology report.')
tests={
 'truncated':fixture(1,0)[:-5],
 'unsupported_transfer_syntax':fixture(1,0,{(2,16):('UI','1.2.840.10008.1.2.4.90')}),
 'unsupported_multiframe':fixture(1,0,{(40,8):('IS','2')}),
 'missing_geometry':fixture(1,0,omit=[(32,50)]),
 'invalid_scaling':fixture(1,0,{(40,4179):('DS','NaN')}),
 'nonnumeric_geometry':fixture(1,0,{(32,50):('DS','0\\bad\\0')}),
 'missing_scaling':fixture(1,0,omit=[(40,4179)]),
 'meta_mismatch':fixture(1,0,{(2,3):('UI','2.25.999')}),
 'rgb':fixture(1,0,{(40,4):('CS','RGB')}),
 'inplane_drift':fixture(1,1,{(32,50):('DS','9\\0\\2')}),
 'zero_orientation':fixture(1,0,{(32,55):('DS','0\\0\\0\\0\\1\\0')}),
}
testcases={k:item(k+'.dcm',v) for k,v in tests.items()}
scenarios={'healthy':healthy+[report],'missing':[x for x in healthy if x['name'] not in ('abstract_series1_slice3.dcm','abstract_series2_slice5.dcm')]+[report],'corrupt':healthy+[testcases['truncated'],report],'unsupported':healthy+[testcases['unsupported_transfer_syntax'],testcases['unsupported_multiframe'],report],'duplicates':healthy+[dict(healthy[0],name='duplicate_copy.dcm'),report]}
expected={'study':'2.25.700','series':[{'id':f'2.25.700.{s}','count':5,'uids':[f'2.25.700.{s}.{i}' for i in range(1,6)],'spacingMm':2} for s in (1,2)],'reportCount':1}
obj={'provenance':'Locally generated abstract geometry; no patient or third-party data; not a full MR IOD conformance fixture.','scenarios':scenarios,'expected':expected,'testCases':testcases}
(ROOT/'fixtures.json').write_text(json.dumps(obj,separators=(',',':')))
allow={x['sha256']:('report' if x==report else 'dicom') for xs in scenarios.values() for x in xs}
allow.update({x['sha256']:'dicom' for x in testcases.values()})
p=ROOT/'intake.mjs'
if p.exists():p.write_text(re.sub(r'/\* ALLOWLIST_START \*/.*?/\* ALLOWLIST_END \*/','/* ALLOWLIST_START */\nconst ALLOWED = '+json.dumps(allow)+';\n/* ALLOWLIST_END */',p.read_text(),flags=re.S))
print('Generated',len(allow),'unique allowed fixtures')
