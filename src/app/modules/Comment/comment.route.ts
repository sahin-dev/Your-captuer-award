import { Router } from "express";
import auth from "../../middlewares/auth.middleware";
import { deleteComment, editComment, getComments, postComment } from "./comment.controller";

const router = Router()

router.route("/").get(auth(),getComments).post(auth(),postComment)
router.route("/:id").put(auth(),editComment).delete(auth(), deleteComment)


export const commentRoutes = router