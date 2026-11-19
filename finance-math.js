// Recorded monthly costs only. Missing data must never become a zero cost.
export function unitEconomics(month) {
 const names=['jobs_completed','sales_value','material_cost','labor_cost','direct_other_cost','operating_cost'];
 const values=names.map(key=>month?.[key]);
 if(values.some(v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))))return null;
 const [jobs,sales,materials,labor,other,overhead]=values.map(Number);
 if(!Number.isInteger(jobs)||jobs<0)return null;
 const direct=materials+labor+other,contribution=sales-direct,result=contribution-overhead;
 return {jobs,sales,direct,contribution,result,
  averageRevenue:jobs?sales/jobs:null,
  directPerJob:jobs?direct/jobs:null,
  contributionPerJob:jobs?contribution/jobs:null,
  overheadPerJob:jobs?overhead/jobs:null,
  resultPerJob:jobs?result/jobs:null,
  margin:jobs&&sales>0?contribution/sales*100:null};
}
