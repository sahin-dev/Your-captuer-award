import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { deleteComment, editComment, getComments, postComment, replyComment } from "./comment.controller";

const router = Router()

router.route("/photos/:photoId").post(auth(), postComment).get(auth(), getComments)
router.post("/reply/:commentId", auth(), replyComment)

router.route("/:commentId").put(auth(),editComment).delete(auth(), deleteComment)


export const commentRoutes = router