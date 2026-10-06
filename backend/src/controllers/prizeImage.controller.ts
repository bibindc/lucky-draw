import { imageHandlers } from './imageHandlers';
import { loadPrizeImage, removePrizeImage, savePrizeImage } from '../services/prizeImage.service';

const prizeImages = imageHandlers({ save: savePrizeImage, remove: removePrizeImage, load: loadPrizeImage, resultKey: 'prize' });
export const uploadImage = prizeImages.upload;
export const deleteImage = prizeImages.remove;
export const serveImage = prizeImages.serve;
