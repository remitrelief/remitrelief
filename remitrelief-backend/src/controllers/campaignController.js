import {
  addCampaignMedia,
  addCampaignMilestone,
  bindCampaignEscrow,
  createCampaign,
  createCampaignUpdate,
  deleteDraftCampaign,
  editCampaignUpdate,
  getCampaignDetail,
  getStats,
  listCampaigns,
  listCampaignUpdates,
  listMyCampaigns,
  submitCampaign,
  transitionCampaign,
  updateCampaign,
  updateCampaignMilestone,
  removeCampaignMedia,
} from "../services/campaignsService.js";

function send(res, data, meta, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export async function discoverCampaigns(req, res) {
  const result = await listCampaigns(req.query);
  return send(res, result.data, result.meta);
}

export async function campaignStats(_req, res) {
  return send(res, await getStats());
}

export async function myCampaigns(req, res) {
  const result = await listMyCampaigns(req.query, req.user);
  return send(res, result.data, result.meta);
}

export async function campaignDetail(req, res) {
  return send(res, await getCampaignDetail(req.params.id, req.user));
}

export async function createCampaignAction(req, res) {
  return send(res, await createCampaign(req.body, req.user), null, 201);
}

export async function updateCampaignAction(req, res) {
  return send(res, await updateCampaign(req.params.id, req.body, req.user));
}

export async function submitCampaignAction(req, res) {
  return send(res, await submitCampaign(req.params.id, req.user));
}

export async function transitionCampaignAction(req, res) {
  return send(
    res,
    await transitionCampaign(
      req.params.id,
      String(req.params.status).toUpperCase(),
      req.user,
      req.body?.reason,
      {
        escrowAddress: req.body?.escrowAddress,
        usdcIssuer: req.body?.usdcIssuer,
      }
    )
  );
}

export async function bindEscrowAction(req, res) {
  return send(
    res,
    await bindCampaignEscrow(
      req.params.id,
      {
        escrowAddress: req.body?.escrowAddress,
        usdcIssuer: req.body?.usdcIssuer,
      },
      req.user
    )
  );
}

export async function deleteCampaignAction(req, res) {
  await deleteDraftCampaign(req.params.id, req.user);
  return res.status(204).end();
}

export async function createMilestoneAction(req, res) {
  return send(
    res,
    await addCampaignMilestone(req.params.id, req.body, req.user),
    null,
    201
  );
}

export async function updateMilestoneAction(req, res) {
  return send(
    res,
    await updateCampaignMilestone(
      req.params.id,
      req.params.milestoneId,
      req.body,
      req.user
    )
  );
}

export async function createUpdateAction(req, res) {
  return send(
    res,
    await createCampaignUpdate(req.params.id, req.body, req.user),
    null,
    201
  );
}

export async function updateUpdateAction(req, res) {
  return send(
    res,
    await editCampaignUpdate(
      req.params.id,
      req.params.updateId,
      req.body,
      req.user
    )
  );
}

export async function listUpdatesAction(req, res) {
  return send(res, await listCampaignUpdates(req.params.id, req.user));
}

export async function createMediaAction(req, res) {
  return send(
    res,
    await addCampaignMedia(req.params.id, req.body, req.user),
    null,
    201
  );
}

export async function deleteMediaAction(req, res) {
  await removeCampaignMedia(req.params.id, req.params.mediaId, req.user);
  return res.status(204).end();
}
