"""Exhaustive integer arithmetic examples; NOT model training or hardware measurement."""
from pathlib import Path
import json,math

def h(q):return int(q).bit_count()
def codebook(bits,k):return [q for q in range(1<<bits) if h(q)<=k]
def project(q,book):return min(book,key=lambda v:((q-v)**2,h(v),abs(v),v))
def flips(seq):return sum((a^b).bit_count() for a,b in zip(seq,seq[1:]))
r={'scope':'7-bit unsigned magnitude; separate sign, no zero point. Exhaustive arithmetic only.','codebooks':[]}
for k in [1,2,3]:
 c=codebook(7,k);p=[project(q,c) for q in range(128)];r['codebooks'].append({'K':k,'magnitude_levels':len(c),'signed_levels':2*len(c)-1,'mean_absolute_error_integer_units':sum(abs(q-v) for q,v in enumerate(p))/128,'max_absolute_error':max(abs(q-v) for q,v in enumerate(p)),'mean_popcount_projected':sum(map(h,p))/128})
r['non_monotone']={'7':h(7),'8':h(8),'7_nearest_K1':project(7,codebook(7,1))}
r['encoding_examples']=[{'value':q,'two_complement_8':format(q&255,'08b'),'two_complement_h':h(q&255),'sign_magnitude_8':str(int(q<0))+format(abs(q),'07b'),'magnitude_h':h(abs(q))} for q in [-1,-2,7,8]]
a=[1,2,1,2];b=[15,15,15,15];r['sequence_examples']={'low_hamming_weight':{'sequence':a,'total_H':sum(map(h,a)),'transitions':flips(a)},'constant_all_ones':{'sequence':b,'total_H':sum(map(h,b)),'transitions':flips(b)}}
r['sparsecol_table_II_accuracy_differences_pp']={'ResNet18':round(69.35-69.12,2),'MobileNetV2':round(71.68-71.10,2)}
r['bitsnet_reported_table_energy_ratio']=368.93/96.31
r['bitslice_VGG11_nonzero_slice_reduction_fraction']=1-5.40/12.59
out=Path(__file__).with_name('arithmetic-results.json');out.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(r,ensure_ascii=False,indent=2))
