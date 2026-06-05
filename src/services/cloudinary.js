const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset)

export const getOptimizedImageUrl = (url) => {
  if (!url?.includes('/upload/')) return url
  return url.replace('/upload/', '/upload/f_auto,q_auto/')
}

export const uploadToCloudinary = async (file) => {
  if (!file) return ''

  if (!isCloudinaryConfigured) {
    return Promise.resolve(URL.createObjectURL(file))
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Image upload failed.')
  }

  const data = await response.json()
  return getOptimizedImageUrl(data.secure_url)
}
