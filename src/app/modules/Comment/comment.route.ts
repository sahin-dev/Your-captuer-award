import { Router } from "express";
import auth, { optionalAuth } from "../../middlewares/auth.middleware";
import { deleteComment, editComment, getComments, postComment, replyComment } from "./comment.controller";

const router = Router()

router.route("/photos/:photoId").post(auth(), postComment).get(optionalAuth(), getComments)
router.post("/reply/:commentId", auth(), replyComment)

router.route("/:commentId").put(auth(),editComment).delete(auth(), deleteComment)


export const commentRoutes = router