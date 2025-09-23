import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { deleteComment, editComment, getComments, postComment } from "./comment.controller";

const router = Router()

router.route("/photos/:photoId").post(auth(), postComment).get(auth(), getComments)

router.route("/:id").put(auth(),editComment).delete(auth(), deleteComment)


export const commentRoutes = router