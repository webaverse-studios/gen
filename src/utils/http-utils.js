export const getFormData = o => {
  const formData = new FormData();
  for (const k in o) {
    formData.append(k, o[k]);
  }
  return formData;
};